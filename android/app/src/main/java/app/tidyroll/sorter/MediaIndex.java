package app.tidyroll.sorter;

import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.Context;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.media.ExifInterface;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.util.Size;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Reads the phone's photo and video library (MediaStore) for the sorter. */
public class MediaIndex {
    static final class Entry {
        final long id;
        final boolean video;
        final Uri uri;
        final String name, mime;
        final long size, taken;

        Entry(long id, boolean video, String name, String mime, long size, long taken) {
            this.id = id;
            this.video = video;
            this.name = name;
            this.mime = mime;
            this.size = size;
            this.taken = taken;
            this.uri = ContentUris.withAppendedId(video ? MediaStore.Video.Media.EXTERNAL_CONTENT_URI : MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id);
        }
    }

    private final Context ctx;
    private final ContentResolver cr;
    private final ConcurrentHashMap<Long, Entry> entries = new ConcurrentHashMap<>();

    MediaIndex(Context ctx) {
        this.ctx = ctx;
        this.cr = ctx.getContentResolver();
    }

    Entry get(long id) {
        return entries.get(id);
    }

    /** Every photo and video the app may see, newest first, as {"items":[...]} JSON. */
    String listJson(boolean location) {
        Uri files = MediaStore.Files.getContentUri(MediaStore.VOLUME_EXTERNAL);
        List<String> cols = new ArrayList<>();
        String[] base = {MediaStore.Files.FileColumns._ID, MediaStore.MediaColumns.DISPLAY_NAME, MediaStore.MediaColumns.RELATIVE_PATH,
                MediaStore.MediaColumns.SIZE, MediaStore.MediaColumns.DATE_MODIFIED, MediaStore.MediaColumns.DATE_TAKEN,
                MediaStore.MediaColumns.MIME_TYPE, MediaStore.MediaColumns.WIDTH, MediaStore.MediaColumns.HEIGHT,
                MediaStore.MediaColumns.DURATION, MediaStore.Files.FileColumns.MEDIA_TYPE, MediaStore.MediaColumns.OWNER_PACKAGE_NAME};
        for (String c : base) cols.add(c);
        if (Build.VERSION.SDK_INT >= 30) cols.add(MediaStore.MediaColumns.IS_FAVORITE);
        String sel = MediaStore.Files.FileColumns.MEDIA_TYPE + " IN (" + MediaStore.Files.FileColumns.MEDIA_TYPE_IMAGE + ","
                + MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO + ")";
        JSONArray items = new JSONArray();
        String own = ctx.getPackageName();
        try (Cursor c = cr.query(files, cols.toArray(new String[0]), sel, null, MediaStore.MediaColumns.DATE_TAKEN + " DESC")) {
            if (c != null) {
                int iId = c.getColumnIndexOrThrow(MediaStore.Files.FileColumns._ID);
                int iName = c.getColumnIndexOrThrow(MediaStore.MediaColumns.DISPLAY_NAME);
                int iPath = c.getColumnIndexOrThrow(MediaStore.MediaColumns.RELATIVE_PATH);
                int iSize = c.getColumnIndexOrThrow(MediaStore.MediaColumns.SIZE);
                int iMod = c.getColumnIndexOrThrow(MediaStore.MediaColumns.DATE_MODIFIED);
                int iTaken = c.getColumnIndexOrThrow(MediaStore.MediaColumns.DATE_TAKEN);
                int iMime = c.getColumnIndexOrThrow(MediaStore.MediaColumns.MIME_TYPE);
                int iW = c.getColumnIndexOrThrow(MediaStore.MediaColumns.WIDTH);
                int iH = c.getColumnIndexOrThrow(MediaStore.MediaColumns.HEIGHT);
                int iDur = c.getColumnIndexOrThrow(MediaStore.MediaColumns.DURATION);
                int iType = c.getColumnIndexOrThrow(MediaStore.Files.FileColumns.MEDIA_TYPE);
                int iOwner = c.getColumnIndexOrThrow(MediaStore.MediaColumns.OWNER_PACKAGE_NAME);
                int iFav = Build.VERSION.SDK_INT >= 30 ? c.getColumnIndex(MediaStore.MediaColumns.IS_FAVORITE) : -1;
                while (c.moveToNext()) {
                    if (own.equals(c.getString(iOwner))) continue; // our own album copies are never re-sorted
                    long id = c.getLong(iId);
                    boolean video = c.getInt(iType) == MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO;
                    String name = c.getString(iName);
                    String path = c.getString(iPath);
                    if (name == null) continue;
                    long size = c.getLong(iSize);
                    long taken = c.getLong(iTaken);
                    String mime = c.getString(iMime);
                    entries.put(id, new Entry(id, video, name, mime, size, taken));
                    JSONObject o = new JSONObject();
                    o.put("id", id);
                    o.put("name", name);
                    o.put("path", (path == null ? "" : path) + name);
                    o.put("size", size);
                    o.put("mtime", c.getLong(iMod) * 1000L);
                    if (taken > 0) o.put("taken", taken);
                    o.put("kind", video ? "video" : "photo");
                    o.put("mime", mime);
                    if (c.getInt(iW) > 0) {
                        o.put("w", c.getInt(iW));
                        o.put("h", c.getInt(iH));
                    }
                    if (video && c.getLong(iDur) > 0) o.put("dur", c.getLong(iDur) / 1000.0);
                    if (iFav >= 0 && c.getInt(iFav) == 1) o.put("fav", true);
                    items.put(o);
                }
            }
        } catch (JSONException e) {
            return Bridge.error(e);
        }
        JSONObject out = new JSONObject();
        try {
            out.put("items", items);
            out.put("location", location);
        } catch (JSONException ignored) {
        }
        return out.toString();
    }

    /** A small JPEG preview, made by the system's media thumbnail cache. */
    byte[] thumbnail(long id) {
        Entry e = entries.get(id);
        if (e == null) return null;
        try {
            Bitmap b = cr.loadThumbnail(e.uri, new Size(384, 384), null);
            ByteArrayOutputStream out = new ByteArrayOutputStream(48 * 1024);
            b.compress(Bitmap.CompressFormat.JPEG, 82, out);
            b.recycle();
            return out.toByteArray();
        } catch (IOException | RuntimeException ex) {
            return null;
        }
    }

    /** The original file (with GPS) when the location permission is granted. */
    Uri readable(Entry e, boolean location) {
        return location ? MediaStore.setRequireOriginal(e.uri) : e.uri;
    }

    /** Capture time, GPS and camera from the file itself, as JSON for the web engine. */
    String metaJson(long id, boolean location) {
        Entry e = entries.get(id);
        JSONObject o = new JSONObject();
        if (e == null) return "{}";
        try {
            if (e.video) videoMeta(e, location, o);
            else photoMeta(e, location, o);
        } catch (Exception ignored) {
            // unreadable file: the list data (date taken, size) is still used
        }
        return o.toString();
    }

    private void photoMeta(Entry e, boolean location, JSONObject o) throws IOException, JSONException {
        try (InputStream in = cr.openInputStream(readable(e, location))) {
            if (in == null) return;
            ExifInterface x = new ExifInterface(in);
            String make = x.getAttribute(ExifInterface.TAG_MAKE);
            String model = x.getAttribute(ExifInterface.TAG_MODEL);
            if (make != null) o.put("make", make.trim());
            if (model != null) o.put("model", model.trim());
            o.put("orient", x.getAttributeInt(ExifInterface.TAG_ORIENTATION, 1));
            int w = x.getAttributeInt(ExifInterface.TAG_IMAGE_WIDTH, 0), h = x.getAttributeInt(ExifInterface.TAG_IMAGE_LENGTH, 0);
            if (w > 0 && h > 0) {
                o.put("w", w);
                o.put("h", h);
            }
            String dt = x.getAttribute(ExifInterface.TAG_DATETIME_ORIGINAL);
            if (dt == null) dt = x.getAttribute(ExifInterface.TAG_DATETIME);
            Long wall = wallClock(dt);
            if (wall != null) {
                o.put("wall", wall);
                Integer off = offsetMinutes(x.getAttribute("OffsetTimeOriginal"));
                if (off == null) off = offsetMinutes(x.getAttribute("OffsetTime"));
                if (off != null) {
                    o.put("off", off);
                    o.put("utc", wall - off * 60000L);
                }
            }
            float[] ll = new float[2];
            if (x.getLatLong(ll) && !(ll[0] == 0 && ll[1] == 0)) {
                o.put("lat", ll[0]);
                o.put("lon", ll[1]);
                if (!o.has("utc") && wall != null) { // GPS time is UTC; read the tags directly (works on Android 10)
                    Long gps = wallClock(x.getAttribute(ExifInterface.TAG_GPS_DATESTAMP) + " " + x.getAttribute(ExifInterface.TAG_GPS_TIMESTAMP));
                    if (gps != null && Math.abs(wall - gps) < 15 * 3600000L) o.put("utc", gps);
                }
            }
        }
    }

    private static final Pattern ISO6709 = Pattern.compile("([+-]\\d+(?:\\.\\d+)?)([+-]\\d+(?:\\.\\d+)?)");

    private void videoMeta(Entry e, boolean location, JSONObject o) throws JSONException, IOException {
        MediaMetadataRetriever r = new MediaMetadataRetriever();
        try {
            r.setDataSource(ctx, readable(e, location));
            String loc = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_LOCATION);
            if (loc != null) {
                Matcher m = ISO6709.matcher(loc);
                if (m.find()) {
                    double lat = Double.parseDouble(m.group(1)), lon = Double.parseDouble(m.group(2));
                    if (!(lat == 0 && lon == 0)) {
                        o.put("lat", lat);
                        o.put("lon", lon);
                    }
                }
            }
            String date = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DATE);
            Long utc = videoDate(date);
            if (utc != null) o.put("utc", utc);
            String dur = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION);
            if (dur != null) o.put("dur", Long.parseLong(dur) / 1000.0);
            String w = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH);
            String h = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT);
            if (w != null && h != null) {
                o.put("w", Integer.parseInt(w));
                o.put("h", Integer.parseInt(h));
            }
        } catch (RuntimeException ignored) {
            // some formats cannot be read
        } finally {
            r.release();
        }
    }

    /** "2025:12:21 17:45:12" as milliseconds, keeping the local clock time (treated as UTC). */
    static Long wallClock(String s) {
        if (s == null || s.trim().length() < 19 || s.startsWith("0000")) return null;
        SimpleDateFormat f = new SimpleDateFormat("yyyy:MM:dd HH:mm:ss", Locale.US);
        f.setTimeZone(TimeZone.getTimeZone("UTC"));
        try {
            return f.parse(s.trim().substring(0, 19)).getTime();
        } catch (ParseException e) {
            return null;
        }
    }

    static Integer offsetMinutes(String s) {
        if (s == null) return null;
        Matcher m = Pattern.compile("^([+-])(\\d{2}):?(\\d{2})$").matcher(s.trim());
        if (!m.find()) return null;
        int v = Integer.parseInt(m.group(2)) * 60 + Integer.parseInt(m.group(3));
        return "-".equals(m.group(1)) ? -v : v;
    }

    /** MediaMetadataRetriever dates look like 20251221T121512.000Z (UTC). */
    static Long videoDate(String s) {
        if (s == null || s.startsWith("1904") || s.startsWith("1970")) return null;
        String[] formats = {"yyyyMMdd'T'HHmmss.SSS'Z'", "yyyyMMdd'T'HHmmss'Z'", "yyyyMMdd'T'HHmmss"};
        for (String p : formats) {
            SimpleDateFormat f = new SimpleDateFormat(p, Locale.US);
            f.setTimeZone(TimeZone.getTimeZone("UTC"));
            try {
                return f.parse(s).getTime();
            } catch (ParseException ignored) {
            }
        }
        return null;
    }
}
