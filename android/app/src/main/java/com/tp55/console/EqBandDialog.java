package com.tp55.console;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.LinearLayout;
import android.widget.SeekBar;
import android.widget.TextView;

import java.util.Locale;

/** 单个频段的编辑面板。 */
public class EqBandDialog {

    public interface Callback {
        void onChanged(int index, boolean commit);
    }

    private static final int ACCENT = 0xFFA78BFA;
    private static final int TEXT = 0xFFE9EDF5;
    private static final int MUTED = 0xFF818B9E;
    private static final int DIM = 0xFF5A6376;

    public static void show(Activity activity, int index, EqEngine.Band band, Callback cb) {
        Context ctx = activity;
        float d = ctx.getResources().getDisplayMetrics().density;

        LinearLayout root = new LinearLayout(ctx);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundResource(R.drawable.bg_dialog);
        int pad = (int) (20 * d);
        root.setPadding(pad, (int) (18 * d), pad, (int) (10 * d));

        // 标题
        LinearLayout titleRow = new LinearLayout(ctx);
        titleRow.setOrientation(LinearLayout.HORIZONTAL);
        titleRow.setGravity(Gravity.CENTER_VERTICAL);

        TextView idx = new TextView(ctx);
        idx.setText("#" + (index + 1));
        idx.setTextSize(17);
        idx.setTextColor(TEXT);
        idx.setTypeface(null, android.graphics.Typeface.BOLD);
        titleRow.addView(idx);

        TextView typeLabel = new TextView(ctx);
        typeLabel.setText("  " + EqEngine.TYPE_NAMES[band.type]);
        typeLabel.setTextSize(13);
        typeLabel.setTextColor(MUTED);
        titleRow.addView(typeLabel);

        TextView toggle = new TextView(ctx);
        toggle.setText(band.enabled ? "已启用" : "已停用");
        toggle.setTextSize(11);
        toggle.setTextColor(band.enabled ? 0xFF4ADE80 : DIM);
        LinearLayout.LayoutParams tlp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        tlp.leftMargin = (int) (12 * d);
        titleRow.addView(toggle, tlp);

        root.addView(titleRow);

        // 类型选择
        LinearLayout typeRow = new LinearLayout(ctx);
        typeRow.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout.LayoutParams trp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        trp.topMargin = (int) (16 * d);
        root.addView(typeRow, trp);

        final TextView[] chips = new TextView[6];
        for (int t = 1; t <= 5; t++) {
            final int type = t;
            TextView chip = new TextView(ctx);
            chip.setText(EqEngine.TYPE_KEYS[t]);
            chip.setTextSize(11);
            chip.setGravity(Gravity.CENTER);
            chip.setPadding(0, (int) (7 * d), 0, (int) (7 * d));
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0,
                    ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
            lp.rightMargin = (int) (6 * d);
            chip.setLayoutParams(lp);
            chip.setBackgroundResource(type == band.type ? R.drawable.bg_chip_active : R.drawable.bg_chip);
            chip.setTextColor(type == band.type ? ACCENT : MUTED);
            chip.setOnClickListener(v -> {
                band.type = type;
                for (int k = 1; k <= 5; k++) {
                    boolean on = k == type;
                    chips[k].setBackgroundResource(on ? R.drawable.bg_chip_active : R.drawable.bg_chip);
                    chips[k].setTextColor(on ? ACCENT : MUTED);
                }
                typeLabel.setText("  " + EqEngine.TYPE_NAMES[type]);
                cb.onChanged(index, false);
            });
            chips[t] = chip;
            typeRow.addView(chip);
        }

        // 频率
        final TextView freqVal = addSlider(ctx, root, d, "频率",
                freqToProgress(band.freq), 0, 1000, val -> formatFreq(progressToFreq(val)));
        // 增益
        final TextView gainVal = addSlider(ctx, root, d, "增益",
                (int) Math.round((band.gain + 12) * 10), 0, 240, val -> {
                    double g = val / 10.0 - 12;
                    return (g > 0 ? "+" : "") + String.format(Locale.US, "%.1f dB", g);
                });
        // Q
        final TextView qVal = addSlider(ctx, root, d, "Q 值",
                qToProgress(band.q), 0, 1000, val -> String.format(Locale.US, "%.2f", progressToQ(val)));

        // 取出三个 SeekBar（addSlider 依次添加）
        SeekBar freqBar = (SeekBar) freqVal.getTag();
        SeekBar gainBar = (SeekBar) gainVal.getTag();
        SeekBar qBar = (SeekBar) qVal.getTag();
        freqBar.setProgress(freqToProgress(band.freq));
        gainBar.setProgress((int) Math.round((band.gain + 12) * 10));
        qBar.setProgress(qToProgress(band.q));

        freqBar.setOnSeekBarChangeListener(new SimpleSeek() {
            @Override
            public void onProgressChanged(SeekBar s, int p, boolean fromUser) {
                band.freq = Math.round(progressToFreq(p));
                freqVal.setText(formatFreq(band.freq));
                if (fromUser) cb.onChanged(index, false);
            }

            @Override
            public void onStopTrackingTouch(SeekBar s) {
                cb.onChanged(index, true);
            }
        });
        gainBar.setOnSeekBarChangeListener(new SimpleSeek() {
            @Override
            public void onProgressChanged(SeekBar s, int p, boolean fromUser) {
                band.gain = Math.round((p / 10.0 - 12) * 10) / 10.0;
                gainVal.setText((band.gain > 0 ? "+" : "") + String.format(Locale.US, "%.1f dB", band.gain));
                if (fromUser) cb.onChanged(index, false);
            }

            @Override
            public void onStopTrackingTouch(SeekBar s) {
                cb.onChanged(index, true);
            }
        });
        qBar.setOnSeekBarChangeListener(new SimpleSeek() {
            @Override
            public void onProgressChanged(SeekBar s, int p, boolean fromUser) {
                band.q = Math.round(progressToQ(p) * 100) / 100.0;
                qVal.setText(String.format(Locale.US, "%.2f", band.q));
                if (fromUser) cb.onChanged(index, false);
            }

            @Override
            public void onStopTrackingTouch(SeekBar s) {
                cb.onChanged(index, true);
            }
        });

        // 底部按钮
        LinearLayout actions = new LinearLayout(ctx);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout.LayoutParams alp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        alp.topMargin = (int) (18 * d);
        root.addView(actions, alp);

        TextView reset = actionButton(ctx, d, "重置该段", false);
        TextView toggleBtn = actionButton(ctx, d, band.enabled ? "停用" : "启用", false);
        TextView done = actionButton(ctx, d, "完成", true);
        actions.addView(reset, weightParams(d, 0));
        actions.addView(toggleBtn, weightParams(d, 8));
        actions.addView(done, weightParams(d, 0));

        AlertDialog dialog = new AlertDialog.Builder(activity, R.style.DialogTheme)
                .setView(root)
                .create();
        if (dialog.getWindow() != null) {
            dialog.getWindow().setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
        }

        reset.setOnClickListener(v -> {
            band.gain = 0;
            band.q = 0.75;
            band.type = 2;
            gainBar.setProgress(120);
            qBar.setProgress(qToProgress(0.75));
            for (int k = 1; k <= 5; k++) {
                boolean on = k == 2;
                chips[k].setBackgroundResource(on ? R.drawable.bg_chip_active : R.drawable.bg_chip);
                chips[k].setTextColor(on ? ACCENT : MUTED);
            }
            typeLabel.setText("  " + EqEngine.TYPE_NAMES[2]);
            cb.onChanged(index, true);
        });

        toggleBtn.setOnClickListener(v -> {
            band.enabled = !band.enabled;
            toggleBtn.setText(band.enabled ? "停用" : "启用");
            toggle.setText(band.enabled ? "已启用" : "已停用");
            toggle.setTextColor(band.enabled ? 0xFF4ADE80 : DIM);
            cb.onChanged(index, true);
        });

        done.setOnClickListener(v -> {
            cb.onChanged(index, true);
            dialog.dismiss();
        });

        dialog.show();
        android.view.Window win = dialog.getWindow();
        if (win != null) {
            int screenW = ctx.getResources().getDisplayMetrics().widthPixels;
            int margin = (int) (22 * d);
            win.setLayout(screenW - margin * 2, ViewGroup.LayoutParams.WRAP_CONTENT);
        }
    }

    /* ------------------------------------------------------------------ */

    private interface Formatter {
        String format(int value);
    }

    private static TextView addSlider(Context ctx, LinearLayout root, float d, String label,
                                      int progress, int max, int maxProgress, Formatter f) {
        LinearLayout row = new LinearLayout(ctx);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout.LayoutParams rp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        rp.topMargin = (int) (14 * d);
        root.addView(row, rp);

        TextView name = new TextView(ctx);
        name.setText(label);
        name.setTextSize(12);
        name.setTextColor(MUTED);
        row.addView(name, new LinearLayout.LayoutParams((int) (52 * d),
                ViewGroup.LayoutParams.WRAP_CONTENT));

        SeekBar bar = new SeekBar(ctx);
        bar.setMinimumHeight((int) (34 * d));
        bar.setMax(maxProgress);
        bar.setProgress(progress);
        LinearLayout.LayoutParams blp = new LinearLayout.LayoutParams(0,
                ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        row.addView(bar, blp);

        TextView value = new TextView(ctx);
        value.setText(f.format(progress));
        value.setTextSize(11);
        value.setTextColor(TEXT);
        value.setGravity(Gravity.END);
        value.setTypeface(android.graphics.Typeface.MONOSPACE);
        value.setLayoutParams(new LinearLayout.LayoutParams((int) (64 * d),
                ViewGroup.LayoutParams.WRAP_CONTENT));
        row.addView(value);
        value.setTag(bar);
        return value;
    }

    private static TextView actionButton(Context ctx, float d, String text, boolean primary) {
        TextView b = new TextView(ctx);
        b.setText(text);
        b.setTextSize(12);
        b.setGravity(Gravity.CENTER);
        b.setPadding(0, (int) (9 * d), 0, (int) (9 * d));
        b.setBackgroundResource(primary ? R.drawable.bg_btn_primary : R.drawable.bg_btn_ghost);
        b.setTextColor(primary ? 0xFF140F22 : MUTED);
        if (primary) b.setTypeface(null, android.graphics.Typeface.BOLD);
        return b;
    }

    private static LinearLayout.LayoutParams weightParams(float d, int leftMargin) {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0,
                ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        lp.leftMargin = (int) (leftMargin * d);
        return lp;
    }

    private static String formatFreq(double f) {
        if (f >= 1000) {
            return String.format(Locale.US, "%.2f kHz", f / 1000);
        }
        return Math.round(f) + " Hz";
    }

    private static int freqToProgress(double f) {
        double t = Math.log(f / 20.0) / Math.log(1000.0);
        return (int) Math.round(EqEngine.clamp(t, 0, 1) * 1000);
    }

    private static double progressToFreq(int p) {
        double t = EqEngine.clamp(p / 1000.0, 0, 1);
        return 20 * Math.pow(1000, t);
    }

    private static int qToProgress(double q) {
        double t = Math.log(q / 0.1) / Math.log(100.0);
        return (int) Math.round(EqEngine.clamp(t, 0, 1) * 1000);
    }

    private static double progressToQ(int p) {
        double t = EqEngine.clamp(p / 1000.0, 0, 1);
        return 0.1 * Math.pow(100, t);
    }

    private static abstract class SimpleSeek implements SeekBar.OnSeekBarChangeListener {
        @Override
        public void onStartTrackingTouch(SeekBar seekBar) {
        }
    }
}
