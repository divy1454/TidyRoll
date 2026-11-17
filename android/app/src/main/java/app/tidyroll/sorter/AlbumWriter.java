package app.tidyroll.sorter;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.os.Environment;
import android.os.StatFs;
import android.provider.MediaStore;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Creates the albums: copies of the chosen photos in Pictures/<root>/<group>/<album>/, which
 * gallery apps show as albums. Originals are only read, never moved or changed. Every copy is
 * logged so Undo can remove exactly what was made.
 */
public class AlbumWriter {
    interface Progress {
        void update(int done, int total, String label);
    }

    private final Context ctx;
    private final ContentResolver cr;
    private final MediaIndex media;

    AlbumWriter(Context ctx, MediaIndex media) {
        this.ctx = ctx;
        this.cr = ctx.getContentResolver();
        this.media = media;
    }

    static long freeBytes() {
        try {
            return new StatFs(Environment.getExternalStorageDirectory().getPath()).getAvailableBytes();
        } catch (RuntimeException e) {
            return -1;
        }
    }

    String apply(JSONObject plan, boolean location, Progress progress) throws JSONException, IOException {
        String root = clean(plan.getString("root"));
        JSONArray albums = plan.getJSONArray("albums");
        int total = 0;
        long need = 0;
        for (int i = 0; i < albums.length(); i++) {
            JSONArray ids = albums.getJSONObject(i).getJSONArray("ids");
            total += ids.length();
            for (int k = 0; k < ids.length(); k++) {
                MediaIndex.Entry e = media.get(ids.getLong(k));
                if (e != null) need += e.size;
            }
        }
        long free = freeBytes();
        if (free >= 0 && need > free - 300L * 1024 * 1024) {
            throw new IOException("Not enough free space: the albums need " + (need / 1_000_000) + " MB and the phone has "
                    + (Math.max(0, free) / 1_000_000) + " MB free. Leave out some albums or free up space.");
        }
        String logId = "save-" + System.currentTimeMillis();
        JSONArray created = new JSONArray();
        int done = 0, skipped = 0;
        long bytes = 0;
        byte[] buf = new byte[256 * 1024];
        for (int i = 0; i < albums.length(); i++) {
            JSONObject a = albums.getJSONObject(i);
            String name = clean(a.getString("name"));
            String rel = Environment.DIRECTORY_PICTURES + "/" + root + "/" + clean(a.getString("group")) + "/" + name + "/";
            JSONArray ids = a.getJSONArray("ids");
            for (int k = 0; k < ids.length(); k++) {
                MediaIndex.Entry e = media.get(ids.getLong(k));
                progress.update(++done, total, name);
                if (e == null) continue;
                if (alreadyThere(e, rel)) {
                    skipped++;
                    continue;
                }
                Uri collection = e.video ? MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
                        : MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
                ContentValues v = new ContentValues();
                v.put(MediaStore.MediaColumns.DISPLAY_NAME, e.name);
                v.put(MediaStore.MediaColumns.MIME_TYPE, e.mime);
                v.put(MediaStore.MediaColumns.RELATIVE_PATH, rel);
                v.put(MediaStore.MediaColumns.IS_PENDING, 1);
                if (e.taken > 0) v.put(MediaStore.MediaColumns.DATE_TAKEN, e.taken);
                Uri out;
                try {
                    out = cr.insert(collection, v);
                } catch (IllegalArgumentException ex) { // some devices refuse DATE_TAKEN on insert
                    v.remove(MediaStore.MediaColumns.DATE_TAKEN);
                    out = cr.insert(collection, v);
                }
                if (out == null) throw new IOException("The gallery refused a new album file.");
                try (InputStream in = cr.openInputStream(media.readable(e, location)); OutputStream os = cr.openOutputStream(out)) {
                    if (in == null || os == null) throw new IOException("Could not open " + e.name);
                    int n;
                    while ((n = in.read(buf)) > 0) os.write(buf, 0, n);
                } catch (IOException | RuntimeException ex) {
                    cr.delete(out, null, null);
                    throw ex;
                }
                ContentValues done1 = new ContentValues();
                done1.put(MediaStore.MediaColumns.IS_PENDING, 0);
                cr.update(out, done1, null, null);
                created.put(out.toString());
                bytes += e.size;
            }
        }
        JSONObject log = new JSONObject();
        log.put("created", created);
        log.put("root", root);
        writeLog(logId, log.toString());
        JSONObject res = new JSONObject();
        res.put("logId", logId);
        res.put("files", created.length());
        res.put("skipped", skipped);
        res.put("bytes", bytes);
        return res.toString();
    }

    /** A copy with the same name and size is already in this album (running Save twice). */
    private boolean alreadyThere(MediaIndex.Entry e, String rel) {
        Uri files = MediaStore.Files.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
        String sel = MediaStore.MediaColumns.RELATIVE_PATH + "=? AND " + MediaStore.MediaColumns.DISPLAY_NAME + "=? AND "
                + MediaStore.MediaColumns.SIZE + "=?";
        try (Cursor c = cr.query(files, new String[]{MediaStore.MediaColumns._ID}, sel, new String[]{rel, e.name, String.valueOf(e.size)}, null)) {
            return c != null && c.getCount() > 0;
        } catch (RuntimeException ex) {
            return false;
        }
    }

    String undo(String logId) throws IOException, JSONException {
        File f = logFile(logId);
        if (!f.exists()) return "{\"removed\":0,\"kept\":0}";
        JSONArray created = new JSONObject(read(f)).getJSONArray("created");
        int removed = 0, kept = 0;
        for (int i = 0; i < created.length(); i++) {
            try {
                if (cr.delete(Uri.parse(created.getString(i)), null, null) > 0) removed++;
            } catch (SecurityException e) { // made by an earlier install: Android asks the person instead
                kept++;
            }
        }
        if (!f.delete()) f.deleteOnExit();
        return "{\"removed\":" + removed + ",\"kept\":" + kept + "}";
    }

    private File logFile(String logId) {
        File dir = new File(ctx.getFilesDir(), "logs");
        if (!dir.exists() && !dir.mkdirs()) return new File(ctx.getFilesDir(), clean(logId) + ".json");
        return new File(dir, clean(logId) + ".json");
    }

    private void writeLog(String logId, String json) throws IOException {
        try (FileOutputStream os = new FileOutputStream(logFile(logId))) {
            os.write(json.getBytes(StandardCharsets.UTF_8));
        }
    }

    private static String read(File f) throws IOException {
        try (FileInputStream in = new FileInputStream(f)) {
            byte[] b = new byte[(int) f.length()];
            int off = 0, n;
            while (off < b.length && (n = in.read(b, off, b.length - off)) > 0) off += n;
            return new String(b, 0, off, StandardCharsets.UTF_8);
        }
    }

    /** Folder names: no slashes or characters storage rejects; never empty. */
    static String clean(String s) {
        String n = s == null ? "" : s.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", " ").replaceAll("\\s+", " ").trim();
        while (n.endsWith(".")) n = n.substring(0, n.length() - 1).trim();
        if (n.isEmpty()) n = "Album";
        return n.length() > 100 ? n.substring(0, 100).trim() : n;
    }
}
