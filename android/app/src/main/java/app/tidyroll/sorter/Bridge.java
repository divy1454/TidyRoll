package app.tidyroll.sorter;

import android.os.SystemClock;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONObject;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Methods the web app can call as window.TidyrollNative.*. Every call answers asynchronously
 * through window.__tidyrollCallback(callbackId, result).
 */
public class Bridge {
    private final MainActivity activity;
    private final WebView web;
    private final MediaIndex media;
    private final AlbumWriter writer;
    private final ExecutorService work = Executors.newSingleThreadExecutor();
    private long lastProgress;

    Bridge(MainActivity activity, WebView web, MediaIndex media) {
        this.activity = activity;
        this.web = web;
        this.media = media;
        this.writer = new AlbumWriter(activity, media);
    }

    @JavascriptInterface
    public String version() {
        return "1";
    }

    @JavascriptInterface
    public void requestPermission(String callbackId) {
        activity.runOnUiThread(() -> activity.askForMedia(callbackId));
    }

    @JavascriptInterface
    public void applyPlan(String planJson, String callbackId) {
        work.execute(() -> {
            try {
                String result = writer.apply(new JSONObject(planJson), activity.hasLocationAccess(), this::progress);
                callback(callbackId, result);
            } catch (Exception e) {
                callback(callbackId, error(e));
            }
        });
    }

    @JavascriptInterface
    public void undo(String logId, String callbackId) {
        work.execute(() -> {
            try {
                callback(callbackId, writer.undo(logId));
            } catch (Exception e) {
                callback(callbackId, error(e));
            }
        });
    }

    @JavascriptInterface
    public long freeSpace() {
        return AlbumWriter.freeBytes();
    }

    void progress(int done, int total, String label) {
        long now = SystemClock.uptimeMillis();
        if (done < total && now - lastProgress < 120) return;
        lastProgress = now;
        String js = "window.__tidyrollProgress && window.__tidyrollProgress(" + done + "," + total + "," + JSONObject.quote(label) + ")";
        web.post(() -> web.evaluateJavascript(js, null));
    }

    /** resultJson must be a JSON value; it is passed to the page as an object literal. */
    void callback(String callbackId, String resultJson) {
        String safe = resultJson.replace("\u2028", "\\u2028").replace("\u2029", "\\u2029");
        String js = "window.__tidyrollCallback && window.__tidyrollCallback(" + JSONObject.quote(callbackId) + "," + safe + ")";
        web.post(() -> web.evaluateJavascript(js, null));
    }

    static String error(Exception e) {
        String msg = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
        return "{\"error\":" + JSONObject.quote(msg) + "}";
    }

    void shutdown() {
        work.shutdown();
    }
}
