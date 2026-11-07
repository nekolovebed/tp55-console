package com.tp55.console;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.Shader;
import android.util.AttributeSet;
import android.view.MotionEvent;
import android.view.View;

import java.util.List;
import java.util.Locale;

/** 可拖拽的频响曲线。 */
public class EqCurveView extends View {

    public interface Listener {
        void onBandSelected(int index);

        void onBandDragging(int index);
    }

    private static final double DB_MIN = -15, DB_MAX = 15;
    private static final double F_MIN = 20, F_MAX = 20000;
    private static final int[] GRID_FREQS = {20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000};

    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint textPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Path path = new Path();

    private List<EqEngine.Band> bands;
    private int selected;
    private double preamp;
    private Listener listener;

    private float padLeft, padRight, padTop, padBottom;
    private float density;

    private int dragIndex = -1;
    private float touchX, touchY;

    public EqCurveView(Context c) {
        this(c, null);
    }

    public EqCurveView(Context c, AttributeSet a) {
        super(c, a);
        density = getResources().getDisplayMetrics().density;
        padLeft = 30 * density;
        padRight = 24 * density;
        padTop = 10 * density;
        padBottom = 18 * density;
        textPaint.setTextSize(8.5f * getResources().getDisplayMetrics().scaledDensity);
        textPaint.setTypeface(android.graphics.Typeface.MONOSPACE);
        paint.setStrokeWidth(1f);
    }

    public void setData(List<EqEngine.Band> bands, int selected, double preamp) {
        this.bands = bands;
        this.selected = selected;
        this.preamp = preamp;
        invalidate();
    }

    public void setSelected(int index) {
        this.selected = index;
        invalidate();
    }

    public void setListener(Listener l) {
        this.listener = l;
    }

    /* ------------------------------------------------------------------ */

    private float plotW() {
        return getWidth() - padLeft - padRight;
    }

    private float plotH() {
        return getHeight() - padTop - padBottom;
    }

    private float xOf(double f) {
        return padLeft + (float) (Math.log10(f / F_MIN) / Math.log10(F_MAX / F_MIN)) * plotW();
    }

    private double fOf(float x) {
        double t = (x - padLeft) / plotW();
        return F_MIN * Math.pow(F_MAX / F_MIN, t);
    }

    private float yOf(double db) {
        return padTop + (float) ((DB_MAX - db) / (DB_MAX - DB_MIN)) * plotH();
    }

    private double dbOf(float y) {
        return DB_MAX - (y - padTop) / plotH() * (DB_MAX - DB_MIN);
    }

    /* ------------------------------------------------------------------ */

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        if (bands == null || bands.isEmpty()) return;
        float pw = plotW(), ph = plotH();
        if (pw <= 0 || ph <= 0) return;

        drawGrid(canvas, pw, ph);
        drawSingleBand(canvas, pw, ph);
        drawTotalCurve(canvas, pw, ph);
        drawNodes(canvas, pw, ph);
    }

    private void drawGrid(Canvas canvas, float pw, float ph) {
        textPaint.setTextAlign(Paint.Align.CENTER);
        for (int f : GRID_FREQS) {
            float x = xOf(f);
            paint.setColor((f == 1000 || f == 10000) ? 0x16FFFFFF : 0x0AFFFFFF);
            paint.setStrokeWidth(1f);
            canvas.drawLine(x, padTop, x, padTop + ph, paint);

            textPaint.setColor(0x66A0A8B8);
            String label = f >= 1000 ? (f / 1000) + "k" : String.valueOf(f);
            canvas.drawText(label, x, padTop + ph + 12 * density, textPaint);
        }

        textPaint.setTextAlign(Paint.Align.RIGHT);
        for (int db = (int) DB_MIN; db <= DB_MAX; db += 3) {
            float y = yOf(db);
            paint.setColor(db == 0 ? 0x28FFFFFF : 0x08FFFFFF);
            paint.setStrokeWidth(db == 0 ? 1.2f : 1f);
            canvas.drawLine(padLeft, y, padLeft + pw, y, paint);

            if (db != 0) {
                textPaint.setColor(0x55707A8C);
                canvas.drawText((db > 0 ? "+" : "") + db, padLeft - 4 * density, y + 3 * density, textPaint);
            }
        }
    }

    private void drawSingleBand(Canvas canvas, float pw, float ph) {
        EqEngine.Band b = bands.get(selected);
        if (!b.enabled) return;
        double[] c = EqEngine.coeffs(b.type, b.freq, b.q, b.gain);
        path.reset();
        int steps = 120;
        for (int i = 0; i <= steps; i++) {
            double f = F_MIN * Math.pow(F_MAX / F_MIN, (double) i / steps);
            double db = EqEngine.clamp(EqEngine.magnitudeDb(c, f), DB_MIN, DB_MAX);
            float x = padLeft + pw * i / steps;
            float y = yOf(db);
            if (i == 0) path.moveTo(x, y);
            else path.lineTo(x, y);
        }
        paint.setShader(null);
        paint.setColor(0x8CF3C580);
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(1.2f * density);
        canvas.drawPath(path, paint);
    }

    private void drawTotalCurve(Canvas canvas, float pw, float ph) {
        int steps = 160;
        double[] total = new double[steps + 1];
        for (int i = 0; i <= steps; i++) total[i] = preamp;

        for (EqEngine.Band b : bands) {
            if (!b.enabled) continue;
            double[] c = EqEngine.coeffs(b.type, b.freq, b.q, b.gain);
            for (int i = 0; i <= steps; i++) {
                double f = F_MIN * Math.pow(F_MAX / F_MIN, (double) i / steps);
                total[i] += EqEngine.magnitudeDb(c, f);
            }
        }

        path.reset();
        for (int i = 0; i <= steps; i++) {
            float x = padLeft + pw * i / steps;
            float y = yOf(EqEngine.clamp(total[i], DB_MIN, DB_MAX));
            if (i == 0) path.moveTo(x, y);
            else path.lineTo(x, y);
        }

        // 填充
        Path fill = new Path(path);
        fill.lineTo(padLeft + pw, yOf(0));
        fill.lineTo(padLeft, yOf(0));
        fill.close();
        paint.setStyle(Paint.Style.FILL);
        paint.setShader(new LinearGradient(0, padTop, 0, padTop + ph,
                0x38A78BFA, 0x03A78BFA, Shader.TileMode.CLAMP));
        canvas.drawPath(fill, paint);

        // 描边
        paint.setShader(new LinearGradient(padLeft, 0, padLeft + pw, 0,
                new int[]{0xFFA78BFA, 0xFFC4A7FF, 0xFFF3C580},
                new float[]{0f, 0.55f, 1f}, Shader.TileMode.CLAMP));
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(2f * density);
        paint.setStrokeJoin(Paint.Join.ROUND);
        canvas.drawPath(path, paint);
        paint.setShader(null);
    }

    private void drawNodes(Canvas canvas, float pw, float ph) {
        for (int i = 0; i < bands.size(); i++) {
            EqEngine.Band b = bands.get(i);
            float x = xOf(b.freq);
            float y = yOf(EqEngine.clamp(b.gain, DB_MIN, DB_MAX));
            boolean sel = i == selected;

            if (sel) {
                paint.setStyle(Paint.Style.FILL);
                paint.setColor(0x2AA78BFA);
                canvas.drawCircle(x, y, 11 * density, paint);
            }

            paint.setStyle(Paint.Style.FILL);
            paint.setColor(b.enabled ? (sel ? 0xFFF7E2B8 : 0xE6ECEFFA) : 0x99788091);
            canvas.drawCircle(x, y, (sel ? 5.2f : 3.6f) * density, paint);

            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(1.4f * density);
            paint.setColor(sel ? 0xFFB79BFF : 0xCC141820);
            canvas.drawCircle(x, y, (sel ? 5.2f : 3.6f) * density, paint);

            if (sel) {
                textPaint.setTextAlign(Paint.Align.CENTER);
                textPaint.setColor(0xFF2A1F12);
                textPaint.setTextSize(8 * getResources().getDisplayMetrics().scaledDensity);
                canvas.drawText(String.valueOf(i + 1), x, y + 2.6f * density, textPaint);
                textPaint.setTextSize(8.5f * getResources().getDisplayMetrics().scaledDensity);
            }
        }
    }

    /* ------------------------------------------------------------------ */

    private int hitTest(float x, float y) {
        if (bands == null) return -1;
        int best = -1;
        float bestD = 26 * density;
        for (int i = 0; i < bands.size(); i++) {
            EqEngine.Band b = bands.get(i);
            float dx = xOf(b.freq) - x;
            float dy = yOf(EqEngine.clamp(b.gain, DB_MIN, DB_MAX)) - y;
            float d = (float) Math.hypot(dx, dy);
            if (d < bestD) {
                bestD = d;
                best = i;
            }
        }
        return best;
    }

    @Override
    public boolean onTouchEvent(MotionEvent e) {
        if (bands == null) return false;
        switch (e.getActionMasked()) {
            case MotionEvent.ACTION_DOWN: {
                int idx = hitTest(e.getX(), e.getY());
                if (idx < 0) return false;
                dragIndex = idx;
                selected = idx;
                touchX = e.getX();
                touchY = e.getY();
                if (listener != null) listener.onBandSelected(idx);
                invalidate();
                return true;
            }
            case MotionEvent.ACTION_MOVE: {
                if (dragIndex < 0) return false;
                EqEngine.Band b = bands.get(dragIndex);
                double f = fOf(e.getX());
                double g = dbOf(e.getY());
                b.freq = Math.round(EqEngine.clamp(f, 20, 20000));
                double step = 0.5;
                b.gain = Math.round(EqEngine.clamp(g, -12, 12) / step) * step;
                touchX = e.getX();
                touchY = e.getY();
                if (listener != null) listener.onBandDragging(dragIndex);
                invalidate();
                return true;
            }
            case MotionEvent.ACTION_UP:
            case MotionEvent.ACTION_CANCEL:
                if (dragIndex >= 0) {
                    dragIndex = -1;
                    if (listener != null) listener.onBandSelected(selected);
                }
                return true;
        }
        return super.onTouchEvent(e);
    }

    public static String fmtGain(double g) {
        return String.format(Locale.US, "%s%.1f", g > 0 ? "+" : "", g);
    }
}
