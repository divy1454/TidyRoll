package app.tidyroll.sorter;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.window.OnBackInvokedDispatcher;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

/**
 * Hosts the Tidyroll web app in a WebView. The app's files, photo thumbnails and photo metadata
 * are served from https://appassets.androidplatform.net/ by this activity; nothing goes online.
 */
public class MainActivity extends Activity {
    static final String HOST = "appassets.androidplatform.net";
    static final String START = "https://" + HOST + "/index.html";
    private static final int REQ_MEDIA = 7;
    static final int DARKROOM = Color.rgb(0x23, 0x18, 0x15);

    private WebView web;
    private Bridge bridge;
    private MediaIndex media;
    private String pendingPermissionCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            WebView.setWebContentsDebuggingEnabled(true);
        }
        media = new MediaIndex(this);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(DARKROOM);
        web = new WebView(this);
        web.setBackgroundColor(DARKROOM);
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        // Keep the page clear of the status bar, navigation bar and camera cut-out (edge-to-edge).
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets i = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                v.setPadding(i.left, i.top, i.right, i.bottom);
            } else {
                v.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                        insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            }
            return insets;
        });

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportZoom(false);

        bridge = new Bridge(this, web, media);
        web.addJavascriptInterface(bridge, "TidyrollNative");
        web.setWebViewClient(new LocalClient());
        setContentView(root);

        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::goBack);
        }
        if (savedInstanceState == null || web.restoreState(savedInstanceState) == null) web.loadUrl(START);
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        goBack();
    }

    /** Ask the page to step back (close a dialog, previous screen); close the app when it can't. */
    private void goBack() {
        web.evaluateJavascript("window.__tidyrollBack ? String(window.__tidyrollBack()) : 'false'", v -> {
            if (!"\"true\"".equals(v)) finish();
        });
    }

    @Override
    protected void onDestroy() {
        bridge.shutdown();
        web.destroy();
        super.onDestroy();
    }

    // ------------------------------------------------------------------ permissions
    static String[] mediaPermissions() {
        if (Build.VERSION.SDK_INT >= 34) {
            return new String[]{Manifest.permission.READ_MEDIA_IMAGES, Manifest.permission.READ_MEDIA_VIDEO,
                    Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED, Manifest.permission.ACCESS_MEDIA_LOCATION};
        }
        if (Build.VERSION.SDK_INT >= 33) {
            return new String[]{Manifest.permission.READ_MEDIA_IMAGES, Manifest.permission.READ_MEDIA_VIDEO,
                    Manifest.permission.ACCESS_MEDIA_LOCATION};
        }
        return new String[]{Manifest.permission.READ_EXTERNAL_STORAGE, Manifest.permission.ACCESS_MEDIA_LOCATION};
    }

    boolean granted(String p) {
        return checkSelfPermission(p) == PackageManager.PERMISSION_GRANTED;
    }

    boolean hasFullAccess() {
        return Build.VERSION.SDK_INT >= 33 ? granted(Manifest.permission.READ_MEDIA_IMAGES) : granted(Manifest.permission.READ_EXTERNAL_STORAGE);
    }

    boolean hasLocationAccess() {
        return granted(Manifest.permission.ACCESS_MEDIA_LOCATION);
    }

    String permissionState() {
        boolean full = hasFullAccess();
        boolean partial = !full && Build.VERSION.SDK_INT >= 34 && granted(Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED);
        JSONObject o = new JSONObject();
        try {
            o.put("state", full ? "granted" : partial ? "partial" : "denied");
            o.put("location", hasLocationAccess());
        } catch (JSONException ignored) {
        }
        return o.toString();
    }

    /** Called from the bridge on the UI thread. */
    void askForMedia(String callbackId) {
        if (hasFullAccess() && hasLocationAccess()) {
            bridge.callback(callbackId, permissionState());
            return;
        }
        pendingPermissionCallback = callbackId;
        requestPermissions(mediaPermissions(), REQ_MEDIA);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_MEDIA && pendingPermissionCallback != null) {
            bridge.callback(pendingPermissionCallback, permissionState());
            pendingPermissionCallback = null;
        }
    }

    // ------------------------------------------------------------------ local server
    private static final Map<String, String> TYPES = new HashMap<>();

    static {
        TYPES.put("html", "text/html");
        TYPES.put("js", "text/javascript");
        TYPES.put("mjs", "text/javascript");
        TYPES.put("css", "text/css");
        TYPES.put("json", "application/json");
        TYPES.put("webmanifest", "application/manifest+json");
        TYPES.put("wasm", "application/wasm");
        TYPES.put("onnx", "application/octet-stream");
        TYPES.put("tsv", "text/plain");
        TYPES.put("txt", "text/plain");
        TYPES.put("svg", "image/svg+xml");
        TYPES.put("png", "image/png");
        TYPES.put("woff2", "font/woff2");
    }

    private final class LocalClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
            Uri u = req.getUrl();
            if (!HOST.equals(u.getHost())) return blocked(); // the app never loads anything from the internet
            String path = u.getPath() == null ? "/" : u.getPath();
            try {
                if (path.equals("/api/media")) {
                    if (!hasFullAccess() && Build.VERSION.SDK_INT < 34) return json(403, "{\"error\":\"Photo access was not allowed.\"}");
                    return json(200, media.listJson(hasLocationAccess()));
                }
                if (path.startsWith("/thumb/")) {
                    byte[] jpg = media.thumbnail(Long.parseLong(path.substring(7)));
                    return jpg == null ? notFound() : response("image/jpeg", 200, new ByteArrayInputStream(jpg));
                }
                if (path.startsWith("/meta/")) {
                    return json(200, media.metaJson(Long.parseLong(path.substring(6)), hasLocationAccess()));
                }
                if (path.endsWith("/")) path += "index.html";
                String asset = "www" + path;
                String ext = path.substring(path.lastIndexOf('.') + 1).toLowerCase();
                String type = TYPES.get(ext);
                InputStream in = getAssets().open(asset);
                return response(type == null ? "application/octet-stream" : type, 200, in);
            } catch (NumberFormatException | IOException e) {
                return notFound();
            } catch (SecurityException e) {
                return json(403, "{\"error\":\"Photo access was not allowed.\"}");
            }
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
            Uri u = req.getUrl();
            if (HOST.equals(u.getHost())) return false;
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, u));
            } catch (ActivityNotFoundException ignored) {
            }
            return true;
        }

        @Override
        public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            recreate(); // the page was too heavy for the device; start it again cleanly
            return true;
        }
    }

    static WebResourceResponse response(String type, int code, InputStream body) {
        Map<String, String> h = new HashMap<>();
        h.put("Cache-Control", "no-cache");
        h.put("Access-Control-Allow-Origin", "https://" + HOST);
        String charset = type.startsWith("text/") || type.contains("json") || type.contains("javascript") ? "utf-8" : null;
        return new WebResourceResponse(type, charset, code, code == 200 ? "OK" : "Error", h, body);
    }

    static WebResourceResponse json(int code, String body) {
        return response("application/json", code, new ByteArrayInputStream(body.getBytes(StandardCharsets.UTF_8)));
    }

    static WebResourceResponse notFound() {
        return response("text/plain", 404, new ByteArrayInputStream(new byte[0]));
    }

    static WebResourceResponse blocked() {
        return response("text/plain", 403, new ByteArrayInputStream(new byte[0]));
    }
}
