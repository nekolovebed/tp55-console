package com.tp55.console;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.ColorDrawable;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.Space;
import android.widget.TextView;
import android.widget.Toast;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public class MainActivity extends Activity implements UsbHid.Listener, EqCurveView.Listener {

    private static final String PREFS = "tp55";
    private static final int ACCENT = 0xFFA78BFA;
    private static final int TEXT = 0xFFE9EDF5;
    private static final int MUTED = 0xFF818B9E;
    private static final int DIM = 0xFF5A6376;
    private static final int GOLD = 0xFFF3C580;

    private UsbHid usb;
    private final List<EqEngine.Band> bands = EqEngine.flatBands();
    private int selected = 0;
    private double preamp = 0;
    private boolean connected = false;
    private String version = "";
    private int dacFilter = 1;
    private int dacMode = 0;
    private int dacOutput = 1;
    private int micGain = 0;

    private EqCurveView curve;
    private LinearLayout bandList;
    private TextView statusText;
    private TextView preampValue;
    private SeekBar preampBar;
    private TextView fwValue;
    private TextView snValue;
    private TextView[] filterChips;
    private TextView[] modeChips;
    private TextView[] outChips;
    private View statusDot;
    private TextView saveButton;
    private LinearLayout rootLayout;

    private LinearLayout pageEq, pageDac, pageMic, pageDevice;
    private TextView[][] tabs;

    private final Handler ui = new Handler(Looper.getMainLooper());
    private boolean pendingSave = false;

    private final Runnable pushRunnable = new Runnable() {
        @Override
        public void run() {
            pushEq();
        }
    };

    /* ------------------------------------------------------------------ */

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        rootLayout = findViewById(R.id.root);
        applyInsets();

        statusText = findViewById(R.id.statusText);
        statusDot = findViewById(R.id.statusDot);
        saveButton = findViewById(R.id.btnSave);

        FrameLayout content = findViewById(R.id.content);
        buildEqPage();
        buildDacPage();
        buildMicPage();
        buildDevicePage();
        content.addView(pageEq);
        content.addView(pageDac);
        content.addView(pageMic);
        content.addView(pageDevice);
        pageDac.setVisibility(View.GONE);
        pageMic.setVisibility(View.GONE);
        pageDevice.setVisibility(View.GONE);

        setupTabs();
        loadState();
        refreshBands();
        updatePreampUi();

        saveButton.setOnClickListener(v -> saveToDevice());

        usb = new UsbHid(this);
        usb.setListener(this);

        checkDisclaimer();
        tryConnect(true);
    }

    private void applyInsets() {
        rootLayout.setOnApplyWindowInsetsListener((v, insets) -> {
            int top;
            int bottom;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars());
                top = bars.top;
                bottom = bars.bottom;
            } else {
                top = insets.getSystemWindowInsetTop();
                bottom = insets.getSystemWindowInsetBottom();
            }
            v.setPadding(0, top, 0, bottom);
            return insets;
        });
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (usb != null && !usb.isConnected()) {
            ui.postDelayed(() -> tryConnect(false), 300);
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        ui.removeCallbacks(pushRunnable);
        if (usb != null) usb.release();
    }

    /* ------------------------------------------------------------------ */
    /* 页面构建                                                            */
    /* ------------------------------------------------------------------ */

    private int dp(float v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }

    private TextView label(String text, float size, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(text);
        t.setTextSize(size);
        t.setTextColor(color);
        if (bold) t.setTypeface(null, Typeface.BOLD);
        return t;
    }

    private LinearLayout card() {
        LinearLayout c = new LinearLayout(this);
        c.setOrientation(LinearLayout.VERTICAL);
        c.setBackgroundResource(R.drawable.bg_card);
        return c;
    }

    private void buildEqPage() {
        pageEq = new LinearLayout(this);
        pageEq.setOrientation(LinearLayout.VERTICAL);

        FrameLayout curveCard = new FrameLayout(this);
        curveCard.setBackgroundResource(R.drawable.bg_card);
        curve = new EqCurveView(this);
        curve.setListener(this);
        curveCard.addView(curve, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        LinearLayout.LayoutParams clp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(178));
        clp.setMargins(dp(12), dp(12), dp(12), 0);
        pageEq.addView(curveCard, clp);

        // 前置增益
        LinearLayout preampRow = new LinearLayout(this);
        preampRow.setOrientation(LinearLayout.HORIZONTAL);
        preampRow.setGravity(Gravity.CENTER_VERTICAL);
        preampRow.setPadding(dp(16), dp(6), dp(16), 0);

        preampRow.addView(label("前置", 11, MUTED, false), new LinearLayout.LayoutParams(dp(34),
                ViewGroup.LayoutParams.WRAP_CONTENT));

        preampBar = new SeekBar(this);
        preampBar.setMax(48);
        preampBar.setProgress(24);
        preampRow.addView(preampBar, new LinearLayout.LayoutParams(0,
                ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        preampValue = label("0.0 dB", 11, TEXT, false);
        preampValue.setTypeface(Typeface.MONOSPACE);
        preampValue.setGravity(Gravity.END);
        preampRow.addView(preampValue, new LinearLayout.LayoutParams(dp(56),
                ViewGroup.LayoutParams.WRAP_CONTENT));

        preampBar.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override
            public void onProgressChanged(SeekBar seekBar, int p, boolean fromUser) {
                preamp = (p - 24) / 2.0;
                updatePreampUi();
                if (fromUser) onBandsChanged();
            }

            @Override
            public void onStartTrackingTouch(SeekBar seekBar) {
            }

            @Override
            public void onStopTrackingTouch(SeekBar seekBar) {
                onBandsChanged();
            }
        });
        pageEq.addView(preampRow, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        // 预设
        HorizontalScrollView presetScroll = new HorizontalScrollView(this);
        presetScroll.setHorizontalScrollBarEnabled(false);
        LinearLayout presetRow = new LinearLayout(this);
        presetRow.setOrientation(LinearLayout.HORIZONTAL);
        presetRow.setPadding(dp(14), dp(6), dp(14), dp(2));
        addPresetChips(presetRow);
        presetScroll.addView(presetRow);
        pageEq.addView(presetScroll, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(42)));

        // 频段列表
        ScrollView scroll = new ScrollView(this);
        scroll.setClipToPadding(false);
        scroll.setPadding(dp(12), dp(2), dp(12), dp(8));
        bandList = new LinearLayout(this);
        bandList.setOrientation(LinearLayout.VERTICAL);
        scroll.addView(bandList);
        pageEq.addView(scroll, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
    }

    private void addPresetChips(LinearLayout row) {
        String[] names = {"平直", "低频", "人声", "柔化", "游戏", "流行"};
        for (int i = 0; i < names.length; i++) {
            final int idx = i;
            TextView chip = label(names[i], 11.5f, MUTED, false);
            chip.setPadding(dp(14), dp(7), dp(14), dp(7));
            chip.setBackgroundResource(R.drawable.bg_chip);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            lp.rightMargin = dp(7);
            chip.setOnClickListener(v -> applyPreset(idx));
            row.addView(chip, lp);
        }
    }

    private TextView chipView(String text, boolean active) {
        TextView chip = label(text, 11.5f, active ? ACCENT : MUTED, false);
        chip.setGravity(Gravity.CENTER);
        chip.setPadding(0, dp(8), 0, dp(8));
        chip.setBackgroundResource(active ? R.drawable.bg_chip_active : R.drawable.bg_chip);
        return chip;
    }

    private void buildDacPage() {
        pageDac = new LinearLayout(this);
        pageDac.setOrientation(LinearLayout.VERTICAL);
        pageDac.setPadding(dp(12), dp(12), dp(12), dp(12));

        pageDac.addView(sectionTitle("数字滤波器"));
        LinearLayout filterCard = card();
        filterCard.setPadding(dp(14), dp(13), dp(14), dp(14));
        filterCard.addView(descText("不同滤波器的滚降速度与相位特性不同，按听感选择。"));
        String[] filters = {"FAST-LL", "FAST-PC", "SLOW-LL", "SLOW-PC", "NON-OS"};
        LinearLayout fr1 = new LinearLayout(this);
        fr1.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout fr2 = new LinearLayout(this);
        fr2.setOrientation(LinearLayout.HORIZONTAL);
        fr2.setPadding(0, dp(7), 0, 0);
        filterChips = new TextView[5];
        for (int i = 0; i < 5; i++) {
            final int value = i + 1;
            TextView chip = chipView(filters[i], value == dacFilter);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0,
                    ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
            lp.rightMargin = i < 4 ? dp(6) : 0;
            chip.setOnClickListener(v -> {
                dacFilter = value;
                for (int k = 0; k < 5; k++) {
                    boolean on = (k + 1) == value;
                    filterChips[k].setBackgroundResource(on ? R.drawable.bg_chip_active : R.drawable.bg_chip);
                    filterChips[k].setTextColor(on ? ACCENT : MUTED);
                }
                usb.send(EqEngine.cmdSetFilter(value));
                saveState();
            });
            filterChips[i] = chip;
            (i < 3 ? fr1 : fr2).addView(chip, lp);
        }
        LinearLayout.LayoutParams frp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        frp.topMargin = dp(12);
        filterCard.addView(fr1, frp);
        filterCard.addView(fr2);
        pageDac.addView(filterCard, cardParams());

        pageDac.addView(sectionTitle("工作模式"));
        LinearLayout modeCard = card();
        modeCard.setPadding(dp(14), dp(13), dp(14), dp(14));
        modeCard.addView(descText("CLASS-AB 与 CLASS-H 的输出级工作方式不同，影响功耗与听感。"));
        LinearLayout modeRow = new LinearLayout(this);
        modeRow.setOrientation(LinearLayout.HORIZONTAL);
        String[] modes = {"CLASS-AB", "CLASS-H"};
        modeChips = new TextView[2];
        for (int i = 0; i < 2; i++) {
            final int value = i;
            TextView chip = chipView(modes[i], value == dacMode);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0,
                    ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
            lp.rightMargin = i == 0 ? dp(6) : 0;
            chip.setOnClickListener(v -> {
                dacMode = value;
                for (int k = 0; k < 2; k++) {
                    boolean on = k == value;
                    modeChips[k].setBackgroundResource(on ? R.drawable.bg_chip_active : R.drawable.bg_chip);
                    modeChips[k].setTextColor(on ? ACCENT : MUTED);
                }
                usb.send(EqEngine.cmdSetWorkMode(value));
                saveState();
            });
            modeChips[i] = chip;
            modeRow.addView(chip, lp);
        }
        LinearLayout.LayoutParams mrp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        mrp.topMargin = dp(12);
        modeCard.addView(modeRow, mrp);
        pageDac.addView(modeCard, cardParams());

        pageDac.addView(sectionTitle("输出增益"));
        LinearLayout outCard = card();
        outCard.setPadding(dp(14), dp(13), dp(14), dp(14));
        outCard.addView(descText("对应机身高低增益拨杆的输出档位。"));
        LinearLayout outRow = new LinearLayout(this);
        outRow.setOrientation(LinearLayout.HORIZONTAL);
        String[] outs = {"低", "中", "高"};
        outChips = new TextView[3];
        for (int i = 0; i < 3; i++) {
            final int value = i + 1;
            TextView chip = chipView(outs[i], value == dacOutput);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0,
                    ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
            lp.rightMargin = i < 2 ? dp(6) : 0;
            chip.setOnClickListener(v -> {
                dacOutput = value;
                for (int k = 0; k < 3; k++) {
                    boolean on = (k + 1) == value;
                    outChips[k].setBackgroundResource(on ? R.drawable.bg_chip_active : R.drawable.bg_chip);
                    outChips[k].setTextColor(on ? ACCENT : MUTED);
                }
                usb.send(EqEngine.cmdSetOutputMode(value));
                saveState();
            });
            outChips[i] = chip;
            outRow.addView(chip, lp);
        }
        LinearLayout.LayoutParams orp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        orp.topMargin = dp(12);
        outCard.addView(outRow, orp);
        pageDac.addView(outCard, cardParams());
    }

    private TextView descText(String text) {
        TextView t = label(text, 11, MUTED, false);
        t.setLineSpacing(dp(3), 1f);
        return t;
    }

    private TextView sectionTitle(String text) {
        TextView t = label(text, 10, DIM, true);
        t.setLetterSpacing(0.08f);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(14);
        lp.bottomMargin = dp(7);
        lp.leftMargin = dp(4);
        t.setLayoutParams(lp);
        return t;
    }

    private LinearLayout.LayoutParams cardParams() {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.bottomMargin = dp(2);
        return lp;
    }

    private void buildMicPage() {
        pageMic = new LinearLayout(this);
        pageMic.setOrientation(LinearLayout.VERTICAL);
        pageMic.setPadding(dp(12), dp(12), dp(12), dp(12));

        pageMic.addView(sectionTitle("麦克风增益"));
        LinearLayout card = card();
        card.setPadding(dp(16), dp(16), dp(16), dp(16));

        TextView desc = label("3.5mm 带麦线控耳机的输入增益。调整后可写入设备。", 11, MUTED, false);
        card.addView(desc);

        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(0, dp(14), 0, 0);
        SeekBar bar = new SeekBar(this);
        bar.setMax(24);
        bar.setProgress(12);
        row.addView(bar, new LinearLayout.LayoutParams(0,
                ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        TextView val = label("0 dB", 12, GOLD, false);
        val.setTypeface(Typeface.MONOSPACE);
        val.setGravity(Gravity.END);
        row.addView(val, new LinearLayout.LayoutParams(dp(58),
                ViewGroup.LayoutParams.WRAP_CONTENT));
        card.addView(row);

        bar.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override
            public void onProgressChanged(SeekBar seekBar, int p, boolean fromUser) {
                micGain = p - 12;
                val.setText((micGain > 0 ? "+" : "") + micGain + " dB");
                if (fromUser && connected) usb.send(EqEngine.cmdSetMic(micGain));
            }

            @Override
            public void onStartTrackingTouch(SeekBar seekBar) {
            }

            @Override
            public void onStopTrackingTouch(SeekBar seekBar) {
                saveState();
            }
        });

        TextView btn = new TextView(this);
        btn.setText("写入并保存");
        btn.setTextSize(12);
        btn.setGravity(Gravity.CENTER);
        btn.setPadding(0, dp(11), 0, dp(11));
        btn.setBackgroundResource(R.drawable.bg_btn_ghost);
        btn.setTextColor(TEXT);
        LinearLayout.LayoutParams blp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        blp.topMargin = dp(18);
        btn.setOnClickListener(v -> {
            usb.send(EqEngine.cmdSetMic(micGain));
            ui.postDelayed(() -> usb.send(EqEngine.cmdFlush()), 200);
            toast("麦克风增益已写入");
        });
        card.addView(btn, blp);
        pageMic.addView(card, cardParams());
    }

    private void buildDevicePage() {
        pageDevice = new LinearLayout(this);
        pageDevice.setOrientation(LinearLayout.VERTICAL);
        pageDevice.setPadding(dp(12), dp(12), dp(12), dp(12));

        pageDevice.addView(sectionTitle("设备"));
        LinearLayout card = card();
        card.setPadding(dp(16), dp(16), dp(16), dp(16));

        TextView name = label("EPZ TP55", 22, TEXT, true);
        card.addView(name);
        TextView tagline = label("双 CS43198 · 10 段 PEQ · USB DAC", 10.5f, MUTED, false);
        tagline.setPadding(0, dp(3), 0, dp(10));
        card.addView(tagline);

        LinearLayout statusRow = new LinearLayout(this);
        statusRow.setOrientation(LinearLayout.HORIZONTAL);
        statusRow.setGravity(Gravity.CENTER_VERTICAL);
        View dot = new View(this);
        dot.setBackgroundResource(R.drawable.dot_off);
        LinearLayout.LayoutParams dlp = new LinearLayout.LayoutParams(dp(6), dp(6));
        statusRow.addView(dot, dlp);
        TextView status = label("未连接", 11.5f, MUTED, false);
        LinearLayout.LayoutParams slp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        slp.leftMargin = dp(7);
        statusRow.addView(status, slp);
        card.addView(statusRow);

        LinearLayout kv = new LinearLayout(this);
        kv.setOrientation(LinearLayout.VERTICAL);
        kv.setPadding(0, dp(12), 0, 0);
        TextView vid = kvRow(kv, "VID", "0x3302");
        TextView pid = kvRow(kv, "PID", "0x4383");
        fwValue = kvRow(kv, "固件", "—");
        snValue = kvRow(kv, "序列号", "—");
        card.addView(kv);

        LinearLayout actions = new LinearLayout(this);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        actions.setPadding(0, dp(16), 0, 0);
        TextView connectBtn = actionButton("连接设备", false);
        TextView factoryBtn = actionButton("恢复出厂 EQ", false);
        LinearLayout.LayoutParams alp = new LinearLayout.LayoutParams(0,
                ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        actions.addView(connectBtn, alp);
        LinearLayout.LayoutParams alp2 = new LinearLayout.LayoutParams(0,
                ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        alp2.leftMargin = dp(8);
        actions.addView(factoryBtn, alp2);
        card.addView(actions);
        pageDevice.addView(card, cardParams());

        connectBtn.setOnClickListener(v -> {
            if (usb.isConnected()) {
                usb.close();
                setConnected(false);
            } else {
                tryConnect(true);
            }
        });
        factoryBtn.setOnClickListener(v -> confirmFactoryReset());

        pageDevice.addView(sectionTitle("免责声明"));
        LinearLayout disc = card();
        disc.setPadding(dp(16), dp(14), dp(16), dp(14));
        TextView discText = label("本程序为第三方非官方工具，通过 USB HID 直接写入设备参数，存在设备配置异常与听力损伤风险。使用前请阅读完整条款。", 11, MUTED, false);
        discText.setLineSpacing(dp(3), 1f);
        disc.addView(discText);
        TextView discBtn = actionButton("查看完整声明", false);
        LinearLayout.LayoutParams dlp2 = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        dlp2.topMargin = dp(12);
        disc.addView(discBtn, dlp2);
        discBtn.setOnClickListener(v -> showDisclaimer(false));
        pageDevice.addView(disc, cardParams());

        pageDevice.addView(sectionTitle("关于"));
        LinearLayout about = card();
        about.setPadding(dp(16), dp(14), dp(16), dp(14));
        kvRow(about, "应用", "TP55 Console 1.0");
        kvRow(about, "协议", "CB HID · report 0x4B");
        kvRow(about, "EQ", "10 段 · Q30 · 96 kHz");
        pageDevice.addView(about, cardParams());
    }

    private TextView kvRow(LinearLayout parent, String key, String value) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setPadding(0, dp(6), 0, dp(6));
        TextView k = label(key, 11, DIM, false);
        row.addView(k, new LinearLayout.LayoutParams(0,
                ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        TextView v = label(value, 11, 0xFFB7C0D0, false);
        v.setTypeface(Typeface.MONOSPACE);
        v.setGravity(Gravity.END);
        row.addView(v);
        parent.addView(row);
        return v;
    }

    private TextView actionButton(String text, boolean primary) {
        TextView b = new TextView(this);
        b.setText(text);
        b.setTextSize(11.5f);
        b.setGravity(Gravity.CENTER);
        b.setPadding(0, dp(9), 0, dp(9));
        b.setBackgroundResource(primary ? R.drawable.bg_btn_primary : R.drawable.bg_btn_ghost);
        b.setTextColor(primary ? 0xFF140F22 : MUTED);
        return b;
    }

    private void setupTabs() {
        LinearLayout tabEq = findViewById(R.id.tabEq);
        LinearLayout tabDac = findViewById(R.id.tabDac);
        LinearLayout tabMic = findViewById(R.id.tabMic);
        LinearLayout tabDevice = findViewById(R.id.tabDevice);

        TextView[] eq = {findViewById(R.id.tabEqLabel), (TextView) ((LinearLayout) tabEq).getChildAt(1)};
        TextView[] dac = {findViewById(R.id.tabDacLabel), findViewById(R.id.tabDacSub)};
        TextView[] mic = {findViewById(R.id.tabMicLabel), findViewById(R.id.tabMicSub)};
        TextView[] dev = {findViewById(R.id.tabDeviceLabel), findViewById(R.id.tabDeviceSub)};
        tabs = new TextView[][]{eq, dac, mic, dev};

        tabEq.setOnClickListener(v -> switchPage(0));
        tabDac.setOnClickListener(v -> switchPage(1));
        tabMic.setOnClickListener(v -> switchPage(2));
        tabDevice.setOnClickListener(v -> switchPage(3));
    }

    private void switchPage(int index) {
        pageEq.setVisibility(index == 0 ? View.VISIBLE : View.GONE);
        pageDac.setVisibility(index == 1 ? View.VISIBLE : View.GONE);
        pageMic.setVisibility(index == 2 ? View.VISIBLE : View.GONE);
        pageDevice.setVisibility(index == 3 ? View.VISIBLE : View.GONE);
        for (int i = 0; i < tabs.length; i++) {
            for (TextView t : tabs[i]) {
                t.setTextColor(i == index ? ACCENT : DIM);
            }
        }
    }

    /* ------------------------------------------------------------------ */
    /* 频段列表                                                            */
    /* ------------------------------------------------------------------ */

    private void refreshBands() {
        bandList.removeAllViews();
        for (int i = 0; i < bands.size(); i++) {
            final int index = i;
            EqEngine.Band b = bands.get(i);
            LinearLayout row = new LinearLayout(this);
            row.setOrientation(LinearLayout.HORIZONTAL);
            row.setGravity(Gravity.CENTER_VERTICAL);
            row.setPadding(dp(10), dp(12), dp(10), dp(12));
            row.setBackgroundResource(i == selected ? R.drawable.bg_row_active : R.drawable.bg_row);

            TextView idx = label(String.valueOf(i + 1), 11, i == selected ? ACCENT : DIM, true);
            idx.setTypeface(Typeface.MONOSPACE);
            row.addView(idx, new LinearLayout.LayoutParams(dp(20),
                    ViewGroup.LayoutParams.WRAP_CONTENT));

            TextView type = label(EqEngine.TYPE_NAMES[b.type], 11.5f,
                    b.enabled ? TEXT : DIM, false);
            row.addView(type, new LinearLayout.LayoutParams(dp(38),
                    ViewGroup.LayoutParams.WRAP_CONTENT));

            TextView freq = label(Math.round(b.freq) + " Hz", 11,
                    b.enabled ? 0xFFB7C0D0 : DIM, false);
            freq.setTypeface(Typeface.MONOSPACE);
            row.addView(freq, new LinearLayout.LayoutParams(dp(72),
                    ViewGroup.LayoutParams.WRAP_CONTENT));

            TextView gain = label((b.gain > 0 ? "+" : "") + String.format(Locale.US, "%.1f", b.gain),
                    11.5f, b.enabled ? GOLD : DIM, false);
            gain.setTypeface(Typeface.MONOSPACE);
            gain.setGravity(Gravity.END);
            LinearLayout.LayoutParams glp = new LinearLayout.LayoutParams(0,
                    ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
            row.addView(gain, glp);

            TextView q = label(String.format(Locale.US, "Q %.2f", b.q), 10,
                    b.enabled ? MUTED : DIM, false);
            q.setTypeface(Typeface.MONOSPACE);
            q.setGravity(Gravity.END);
            row.addView(q, new LinearLayout.LayoutParams(dp(64),
                    ViewGroup.LayoutParams.WRAP_CONTENT));

            row.setOnClickListener(v -> {
                selected = index;
                curve.setSelected(index);
                refreshBands();
                EqBandDialog.show(this, index, bands.get(index), (idx2, commit) -> {
                    selected = idx2;
                    curve.setSelected(idx2);
                    refreshBands();
                    onBandsChanged();
                });
            });

            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            lp.bottomMargin = dp(2);
            bandList.addView(row, lp);
        }
        curve.setData(bands, selected, preamp);
    }

    private void refreshDacChips() {
        if (filterChips != null) {
            for (int k = 0; k < filterChips.length; k++) {
                boolean on = (k + 1) == dacFilter;
                if (filterChips[k] == null) continue;
                filterChips[k].setBackgroundResource(on ? R.drawable.bg_chip_active : R.drawable.bg_chip);
                filterChips[k].setTextColor(on ? ACCENT : MUTED);
            }
        }
        if (modeChips != null) {
            for (int k = 0; k < modeChips.length; k++) {
                boolean on = k == dacMode;
                if (modeChips[k] == null) continue;
                modeChips[k].setBackgroundResource(on ? R.drawable.bg_chip_active : R.drawable.bg_chip);
                modeChips[k].setTextColor(on ? ACCENT : MUTED);
            }
        }
        if (outChips != null) {
            for (int k = 0; k < outChips.length; k++) {
                boolean on = (k + 1) == dacOutput;
                if (outChips[k] == null) continue;
                outChips[k].setBackgroundResource(on ? R.drawable.bg_chip_active : R.drawable.bg_chip);
                outChips[k].setTextColor(on ? ACCENT : MUTED);
            }
        }
    }

    private void updatePreampUi() {
        preampValue.setText((preamp > 0 ? "+" : "") + String.format(Locale.US, "%.1f dB", preamp));
    }

    @Override
    public void onBandSelected(int index) {
        selected = index;
        refreshBands();
        saveState();
        schedulePush();
    }

    @Override
    public void onBandDragging(int index) {
        selected = index;
        curve.setData(bands, selected, preamp);
        updateRowTexts();
        schedulePush();
    }

    private void updateRowTexts() {
        for (int i = 0; i < bandList.getChildCount() && i < bands.size(); i++) {
            View row = bandList.getChildAt(i);
            if (!(row instanceof LinearLayout)) continue;
            LinearLayout ll = (LinearLayout) row;
            EqEngine.Band b = bands.get(i);
            if (ll.getChildCount() >= 5) {
                ((TextView) ll.getChildAt(2)).setText(Math.round(b.freq) + " Hz");
                ((TextView) ll.getChildAt(3)).setText(
                        (b.gain > 0 ? "+" : "") + String.format(Locale.US, "%.1f", b.gain));
                ((TextView) ll.getChildAt(4)).setText(String.format(Locale.US, "Q %.2f", b.q));
            }
        }
        curve.setData(bands, selected, preamp);
    }

    /* ------------------------------------------------------------------ */
    /* 预设                                                                */
    /* ------------------------------------------------------------------ */

    private static final double[][][] PRESETS = {
            {}, // 平直
            {{2, 32, 0.7, 4.5}, {2, 60, 0.8, 5.5}, {2, 150, 1.0, -1.5}, {2, 400, 1.0, -1.0}},
            {{2, 220, 1.1, -1.5}, {2, 800, 1.0, -1.0}, {2, 1800, 1.2, 1.5}, {2, 3000, 1.3, 2.5},
                    {2, 5200, 2.2, -2.0}, {2, 8000, 1.4, 1.2}, {2, 12000, 1.0, 0.8}},
            {{2, 50, 0.7, 1.0}, {2, 200, 0.9, 0.5}, {2, 3000, 1.2, -0.5}, {2, 6500, 1.8, -3.5},
                    {3, 10000, 0.9, -2.0}},
            {{2, 30, 0.7, 1.5}, {2, 120, 1.0, -2.0}, {2, 300, 1.2, -1.5}, {2, 900, 1.4, -1.0},
                    {2, 2000, 1.6, 2.5}, {2, 3500, 1.6, 3.5}, {2, 6000, 1.6, 2.0}, {2, 9000, 1.4, 1.0}},
            {{2, 45, 0.7, 3.0}, {2, 100, 0.9, 2.0}, {2, 300, 1.1, -1.0}, {2, 900, 1.1, -0.5},
                    {2, 2200, 1.2, 1.0}, {2, 3500, 1.4, 1.5}, {2, 6500, 1.6, -1.0}, {2, 9000, 1.0, 1.0},
                    {3, 12000, 0.9, 1.5}},
    };

    private static final double[] PRESET_PREAMP = {0, -2, -1, 0, -2, -2};

    private void applyPreset(int index) {
        List<EqEngine.Band> next = EqEngine.flatBands();
        for (int i = 0; i < PRESETS.length; i++) {
            if (i != index) continue;
            for (int k = 0; k < PRESETS[i].length && k < next.size(); k++) {
                double[] s = PRESETS[i][k];
                EqEngine.Band b = next.get(k);
                b.type = (int) s[0];
                b.freq = s[1];
                b.q = s[2];
                b.gain = s[3];
            }
            preamp = PRESET_PREAMP[i];
        }
        bands.clear();
        bands.addAll(next);
        selected = 0;
        refreshBands();
        updatePreampUi();
        onBandsChanged();
        toast("已载入预设");
    }

    /* ------------------------------------------------------------------ */
    /* 设备                                                                */
    /* ------------------------------------------------------------------ */

    private void tryConnect(boolean requestPermission) {
        if (usb == null) return;
        android.hardware.usb.UsbDevice d = usb.findDevice();
        if (d == null) {
            setConnected(false);
            return;
        }
        if (!usb.hasPermission(d)) {
            statusText.setText("待授权");
            if (requestPermission) usb.requestPermission(d);
            return;
        }
        usb.open();
    }

    private void setConnected(boolean on) {
        connected = on;
        statusText.setText(on ? ("TP55" + (version.isEmpty() ? "" : " · FW " + version)) : "未连接");
        statusDot.setBackgroundResource(on ? R.drawable.dot_on : R.drawable.dot_off);
    }

    @Override
    public void onConnected(String product, String serial) {
        setConnected(true);
        if (snValue != null) snValue.setText(serial == null || serial.isEmpty() ? "—" : serial);
        if (fwValue != null) fwValue.setText(version.isEmpty() ? "—" : version);
        toast("设备已连接");
        usb.send(EqEngine.cmdReadVersion());
        usb.send(EqEngine.cmdReadDacState());
        usb.send(EqEngine.cmdReadWorkMode());
        usb.send(EqEngine.cmdReadOutputMode());
        ui.postDelayed(() -> pushEq(), 350);
    }

    @Override
    public void onDisconnected() {
        connected = false;
        version = "";
        statusText.setText("未连接");
        statusDot.setBackgroundResource(R.drawable.dot_off);
    }

    @Override
    public void onReport(byte[] data) {
        String v = EqEngine.parseVersion(data);
        if (v != null) {
            version = v;
            setConnected(true);
            if (fwValue != null) fwValue.setText(v);
            return;
        }
        int f = EqEngine.parseStateValue(data, 0x11);
        if (f != Integer.MIN_VALUE && f >= 1 && f <= 5) {
            dacFilter = f;
            refreshDacChips();
            return;
        }
        int m = EqEngine.parseStateValue(data, 0x1d);
        if (m != Integer.MIN_VALUE) {
            dacMode = m;
            refreshDacChips();
            return;
        }
        int o = EqEngine.parseStateValue(data, 0x19);
        if (o != Integer.MIN_VALUE && o >= 0 && o <= 2) {
            dacOutput = o + 1;
            refreshDacChips();
            return;
        }
        int mic = EqEngine.parseStateValue(data, 0x02);
        if (mic != Integer.MIN_VALUE) {
            micGain = mic;
        }
    }

    @Override
    public void onError(String message) {
        toast(message);
    }

    private void onBandsChanged() {
        curve.setData(bands, selected, preamp);
        saveState();
        schedulePush();
    }

    private void schedulePush() {
        ui.removeCallbacks(pushRunnable);
        ui.postDelayed(pushRunnable, 240);
    }

    private void pushEq() {
        if (!connected || usb == null) return;
        for (int i = 0; i < bands.size(); i++) {
            usb.send(EqEngine.bandPacket(i, bands.get(i), (int) Math.round(preamp), 1));
        }
        usb.send(EqEngine.cmdCommit());
    }

    private void saveToDevice() {
        if (!connected) {
            toast("设备未连接");
            return;
        }
        saveButton.setText("写入中");
        saveButton.setEnabled(false);
        pushEq();
        ui.postDelayed(() -> {
            usb.send(EqEngine.cmdFlush());
            ui.postDelayed(() -> {
                usb.send(EqEngine.cmdSaveSlot());
                saveButton.setText("已保存");
                saveButton.setEnabled(true);
                toast("已保存到设备");
                ui.postDelayed(() -> saveButton.setText("保存"), 1800);
            }, 150);
        }, 1000);
    }

    private void confirmFactoryReset() {
        new AlertDialog.Builder(this, R.style.DialogTheme)
                .setTitle("恢复出厂 EQ")
                .setMessage("将把 10 段均衡器重置为平直状态并写入设备，当前调音会丢失。确定继续？")
                .setNegativeButton("取消", null)
                .setPositiveButton("恢复", (d, w) -> {
                    List<EqEngine.Band> flat = EqEngine.flatBands();
                    bands.clear();
                    bands.addAll(flat);
                    preamp = 0;
                    selected = 0;
                    refreshBands();
                    updatePreampUi();
                    saveState();
                    pushEq();
                    ui.postDelayed(() -> usb.send(EqEngine.cmdFlush()), 900);
                    toast("已恢复平直");
                })
                .show();
    }

    /* ------------------------------------------------------------------ */
    /* 持久化                                                              */
    /* ------------------------------------------------------------------ */

    private void saveState() {
        SharedPreferences sp = getSharedPreferences(PREFS, MODE_PRIVATE);
        StringBuilder sb = new StringBuilder();
        for (EqEngine.Band b : bands) {
            sb.append(b.type).append(',').append((long) b.freq).append(',')
                    .append(b.q).append(',').append(b.gain).append(',')
                    .append(b.enabled ? 1 : 0).append(';');
        }
        sp.edit()
                .putString("bands", sb.toString())
                .putFloat("preamp", (float) preamp)
                .putInt("filter", dacFilter)
                .putInt("dacMode", dacMode)
                .putInt("dacOutput", dacOutput)
                .putInt("mic", micGain)
                .apply();
    }

    private void loadState() {
        SharedPreferences sp = getSharedPreferences(PREFS, MODE_PRIVATE);
        String raw = sp.getString("bands", "");
        if (raw != null && !raw.isEmpty()) {
            List<EqEngine.Band> loaded = new ArrayList<>();
            for (String part : raw.split(";")) {
                if (part.isEmpty()) continue;
                String[] f = part.split(",");
                if (f.length < 5) continue;
                EqEngine.Band b = new EqEngine.Band();
                b.type = Integer.parseInt(f[0]);
                b.freq = Double.parseDouble(f[1]);
                b.q = Double.parseDouble(f[2]);
                b.gain = Double.parseDouble(f[3]);
                b.enabled = "1".equals(f[4]);
                loaded.add(b);
            }
            if (loaded.size() == 10) {
                bands.clear();
                bands.addAll(loaded);
            }
        }
        preamp = sp.getFloat("preamp", 0);
        dacFilter = sp.getInt("filter", 1);
        dacMode = sp.getInt("dacMode", 0);
        dacOutput = sp.getInt("dacOutput", 1);
        micGain = sp.getInt("mic", 0);

        if (preampBar != null) {
            preampBar.setProgress((int) Math.round(preamp * 2 + 24));
        }
    }

    /* ------------------------------------------------------------------ */
    /* 免责声明                                                            */
    /* ------------------------------------------------------------------ */

    private void checkDisclaimer() {
        SharedPreferences sp = getSharedPreferences(PREFS, MODE_PRIVATE);
        if (!sp.getBoolean("disclaimer", false)) {
            showDisclaimer(true);
        }
    }

    private void showDisclaimer(boolean force) {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundResource(R.drawable.bg_dialog);

        ScrollView scroll = new ScrollView(this);
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(dp(22), dp(20), dp(22), dp(10));

        TextView title = label("免责声明与使用条款", 18, TEXT, true);
        box.addView(title);
        TextView meta = label("版本 1.0 · 更新于 2026 年 11 月 7 日", 9.5f, DIM, false);
        meta.setPadding(0, dp(6), 0, dp(14));
        box.addView(meta);

        String[][] sections = {
                {"一、非官方工具", "本程序为个人独立开发的第三方本地调试工具，并非 EPZ 官方软件，与 EPZ 及其关联公司不存在任何隶属、授权、合作或背书关系。程序中出现的「EPZ」「TP55」等名称仅用于说明兼容设备，相关商标归其权利人所有。"},
                {"二、工作原理与固有风险", "本程序通过 USB HID 接口直接向 TP55 的 DSP 与 Flash 写入均衡器参数及配置，属于对硬件的底层操作。主要功能虽已验证，但仍可能因固件版本差异、设备个体差异、写入中断（拔线、断电、休眠）等导致参数异常、配置丢失或设备无响应，风险由使用者承担。"},
                {"三、听力与设备安全", "均衡器会改变输出频响与电平。对某些频段（尤其低频）施加较大增益可能引起削波与失真，高音量下可能损伤听力或耳机单元。请从小幅度开始并控制音量；提升某频段时建议同时用前置增益做整体衰减。"},
                {"四、Flash 写入寿命", "「保存到设备」会将参数写入设备 Flash，而 Flash 存在擦写次数限制。日常试听请使用实时调节，待调音定型后再保存。"},
                {"五、数据与隐私", "本程序完全离线运行，不收集、不上传任何数据，不包含遥测、统计或广告组件。你的调音配置仅保存在本机。"},
                {"六、无担保与责任限制", "本程序按「现状」提供，不附带任何明示或暗示的担保。在法律允许的最大范围内，作者不对因使用或无法使用本程序导致的任何直接、间接、偶然或后果性损失承担责任。"},
                {"七、协议来源", "设备通信协议来自对官方网页前端代码的互操作性分析，仅用于与自有设备兼容。官方更新后本程序可能失效。"},
                {"八、条款接受", "继续使用即表示你已阅读、理解并同意上述全部条款。如不同意，请停止使用并删除本程序。若部分条款被认定为无效，其余条款仍然有效。"},
        };
        for (String[] sec : sections) {
            TextView h = label(sec[0], 12.5f, TEXT, true);
            h.setPadding(0, dp(14), 0, dp(5));
            box.addView(h);
            TextView p = label(sec[1], 11.5f, MUTED, false);
            p.setLineSpacing(dp(3), 1f);
            box.addView(p);
        }
        scroll.addView(box);
        root.addView(scroll, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        LinearLayout actions = new LinearLayout(this);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        actions.setPadding(dp(20), dp(8), dp(20), dp(18));

        AlertDialog dialog = new AlertDialog.Builder(this, R.style.DialogTheme)
                .setView(root)
                .create();
        dialog.setCancelable(!force);

        if (force) {
            TextView quit = actionButton("退出程序", false);
            TextView agree = actionButton("我已阅读并同意", true);
            LinearLayout.LayoutParams qlp = new LinearLayout.LayoutParams(0,
                    ViewGroup.LayoutParams.WRAP_CONTENT, 0.8f);
            LinearLayout.LayoutParams alp = new LinearLayout.LayoutParams(0,
                    ViewGroup.LayoutParams.WRAP_CONTENT, 1.5f);
            alp.leftMargin = dp(8);
            actions.addView(quit, qlp);
            actions.addView(agree, alp);
            quit.setOnClickListener(v -> finishAffinity());
            agree.setOnClickListener(v -> {
                getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean("disclaimer", true).apply();
                dialog.dismiss();
            });
        } else {
            TextView close = actionButton("关闭", false);
            actions.addView(close, new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
            close.setOnClickListener(v -> dialog.dismiss());
        }
        root.addView(actions, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        dialog.show();
        android.view.Window w = dialog.getWindow();
        if (w != null) {
            w.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
            int screenW = getResources().getDisplayMetrics().widthPixels;
            int screenH = getResources().getDisplayMetrics().heightPixels;
            w.setLayout(screenW - dp(28), (int) (screenH * 0.86));
        }
    }

    /* ------------------------------------------------------------------ */

    private void toast(String msg) {
        Toast.makeText(this, msg, Toast.LENGTH_SHORT).show();
    }
}
