package com.tp55.console;

import java.util.ArrayList;
import java.util.List;

/** 与设备 DSP 完全一致的 biquad 计算与报文编解码。 */
public final class EqEngine {

    public static final int SAMPLE_RATE = 96000;
    private static final double FIXED = 1073741824.0; // 2^30

    public static final int[] DEFAULT_FREQS = {20, 50, 200, 500, 1000, 3000, 8000, 10000, 12000, 16000};
    public static final String[] TYPE_KEYS = {"", "LS", "PK", "HS", "LP", "HP"};
    public static final String[] TYPE_NAMES = {"", "低架", "峰值", "高架", "低通", "高通"};

    private EqEngine() {
    }

    /* ------------------------------------------------------------------ */

    public static class Band {
        public boolean enabled = true;
        public int type = 2;
        public double freq;
        public double q = 0.75;
        public double gain = 0;

        public Band() {
        }

        public Band(int type, double freq, double q, double gain) {
            this.type = type;
            this.freq = freq;
            this.q = q;
            this.gain = gain;
        }

        public Band copy() {
            Band b = new Band(type, freq, q, gain);
            b.enabled = enabled;
            return b;
        }
    }

    public static List<Band> flatBands() {
        List<Band> list = new ArrayList<>();
        for (int f : DEFAULT_FREQS) list.add(new Band(2, f, 0.75, 0));
        return list;
    }

    public static List<Band> fromSparse(double[][] spec) {
        List<Band> list = flatBands();
        for (int i = 0; i < spec.length && i < list.size(); i++) {
            double[] s = spec[i];
            if (s == null) continue;
            Band b = list.get(i);
            b.type = (int) s[0];
            b.freq = s[1];
            b.q = s[2];
            b.gain = s[3];
        }
        return list;
    }

    /* ------------------------------------------------------------------ */

    public static double[] coeffs(int type, double freq, double q, double gainDb) {
        double A = Math.pow(10, gainDb / 40.0);
        double w = 2 * Math.PI * freq / SAMPLE_RATE;
        double cw = Math.cos(w);
        double sw = Math.sin(w);
        double alpha = sw / (2 * Math.max(q, 0.0001));
        double b0, b1, b2, a0, a1, a2;

        switch (type) {
            case 1: {
                double s = 2 * Math.sqrt(A) * alpha;
                b0 = A * (A + 1 - (A - 1) * cw + s);
                b1 = 2 * A * (A - 1 - (A + 1) * cw);
                b2 = A * (A + 1 - (A - 1) * cw - s);
                a0 = A + 1 + (A - 1) * cw + s;
                a1 = -2 * (A - 1 + (A + 1) * cw);
                a2 = A + 1 + (A - 1) * cw - s;
                break;
            }
            case 3: {
                double s = 2 * Math.sqrt(A) * alpha;
                b0 = A * (A + 1 + (A - 1) * cw + s);
                b1 = -2 * A * (A - 1 + (A + 1) * cw);
                b2 = A * (A + 1 + (A - 1) * cw - s);
                a0 = A + 1 - (A - 1) * cw + s;
                a1 = 2 * (A - 1 - (A + 1) * cw);
                a2 = A + 1 - (A - 1) * cw - s;
                break;
            }
            case 4:
                b0 = (1 - cw) / 2;
                b1 = 1 - cw;
                b2 = (1 - cw) / 2;
                a0 = 1 + alpha;
                a1 = -2 * cw;
                a2 = 1 - alpha;
                break;
            case 5:
                b0 = (1 + cw) / 2;
                b1 = -(1 + cw);
                b2 = (1 + cw) / 2;
                a0 = 1 + alpha;
                a1 = -2 * cw;
                a2 = 1 - alpha;
                break;
            case 6:
                b0 = 1;
                b1 = -2 * cw;
                b2 = 1;
                a0 = 1 + alpha;
                a1 = -2 * cw;
                a2 = 1 - alpha;
                break;
            case 2:
            default:
                b0 = 1 + alpha * A;
                b1 = -2 * cw;
                b2 = 1 - alpha * A;
                a0 = 1 + alpha / A;
                a1 = -2 * cw;
                a2 = 1 - alpha / A;
                break;
        }
        return new double[]{b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0};
    }

    public static double magnitudeDb(double[] c, double freq) {
        double w = 2 * Math.PI * freq / SAMPLE_RATE;
        double cw = Math.cos(w), sw = Math.sin(w);
        double cw2 = Math.cos(2 * w), sw2 = Math.sin(2 * w);
        double numRe = c[0] + c[1] * cw + c[2] * cw2;
        double numIm = -(c[1] * sw + c[2] * sw2);
        double denRe = 1 + c[3] * cw + c[4] * cw2;
        double denIm = -(c[3] * sw + c[4] * sw2);
        double num = Math.hypot(numRe, numIm);
        double den = Math.hypot(denRe, denIm);
        if (num <= 0 || den <= 0) return -120;
        return 20 * Math.log10(num / den);
    }

    /* ------------------------------------------------------------------ */

    public static byte[] bandPacket(int seg, Band band, int offset, int tag) {
        double freq = clamp(band.freq, 20, 20000);
        double q = clamp(band.q, 0.1, 10);
        double gain = clamp(band.gain, -12, 12);
        double[] c = coeffs(band.type, freq, q, gain);

        byte[] b = new byte[36];
        b[0] = 0x01;
        b[1] = 0x09;
        b[2] = 24;
        b[3] = 0;
        b[4] = (byte) (seg & 0xff);
        b[5] = 0;
        b[6] = 0;
        for (int i = 0; i < 5; i++) {
            int v = (int) Math.round(c[i] * FIXED);
            if (i >= 3) v = -v; // 设备存 -a1 / -a2
            putIntLe(b, 7 + i * 4, v);
        }
        putShortLe(b, 27, (int) Math.round(freq));
        putShortLe(b, 29, (int) Math.round(q * 256));
        putShortLe(b, 31, (int) Math.round(gain * 256));
        b[33] = (byte) band.type;
        b[34] = (byte) clamp(offset, -60, 60);
        b[35] = (byte) (tag & 0xff);
        return b;
    }

    private static void putIntLe(byte[] b, int off, int v) {
        b[off] = (byte) (v & 0xff);
        b[off + 1] = (byte) ((v >> 8) & 0xff);
        b[off + 2] = (byte) ((v >> 16) & 0xff);
        b[off + 3] = (byte) ((v >> 24) & 0xff);
    }

    private static void putShortLe(byte[] b, int off, int v) {
        b[off] = (byte) (v & 0xff);
        b[off + 1] = (byte) ((v >> 8) & 0xff);
    }

    public static double clamp(double v, double min, double max) {
        return Math.min(max, Math.max(min, v));
    }

    /** 解析读回的单段数据，兼容含 / 不含 report id 两种缓冲区。 */
    public static Band parseBand(byte[] r) {
        if (r == null) return null;
        int base = reportBase(r);
        if (base < 0 || r.length < base + 36) return null;
        if ((r[base] & 0xff) != 0x80 || (r[base + 1] & 0xff) != 0x09) return null;
        Band b = new Band();
        b.freq = readUShort(r, base + 27);
        b.q = readUShort(r, base + 29) / 256.0;
        b.gain = readShort(r, base + 31) / 256.0;
        b.type = r[base + 33] & 0xff;
        return b;
    }

    /** 0 表示缓冲区不含 report id（数据从 0x80 开始），1 表示含。 */
    private static int reportBase(byte[] r) {
        if (r == null || r.length < 4) return -1;
        if ((r[0] & 0xff) == 0x4b) return 1;
        if ((r[0] & 0xff) == 0x80) return 0;
        return -1;
    }

    public static int readUShort(byte[] b, int off) {
        return (b[off] & 0xff) | ((b[off + 1] & 0xff) << 8);
    }

    public static int readShort(byte[] b, int off) {
        return (short) ((b[off] & 0xff) | ((b[off + 1] & 0xff) << 8));
    }

    /** 固件版本字符串，如 "1.4"。 */
    public static String parseVersion(byte[] r) {
        int base = reportBase(r);
        if (base < 0 || r.length < base + 4) return null;
        if ((r[base] & 0xff) != 0x80 || (r[base + 1] & 0xff) != 0x0c) return null;
        StringBuilder sb = new StringBuilder();
        for (int i = base + 3; i < r.length; i++) {
            int c = r[i] & 0xff;
            if (c == 0) break;
            if (c < 32 || c > 126) break;
            sb.append((char) c);
        }
        return sb.length() == 0 ? null : sb.toString();
    }

    /** 解析 DAC 状态值（0x11 滤波器 / 0x1d 模式 / 0x19 输出 / 0x02 麦克风）。 */
    public static int parseStateValue(byte[] r, int cmd) {
        int base = reportBase(r);
        if (base < 0 || r.length < base + 5) return Integer.MIN_VALUE;
        if ((r[base] & 0xff) != 0x80 || (r[base + 1] & 0xff) != cmd) return Integer.MIN_VALUE;
        return r[base + 3] & 0xff;
    }

    /* ------------------------------------------------------------------ */
    /* 命令                                                                */
    /* ------------------------------------------------------------------ */

    public static byte[] cmdReadVersion() {
        return new byte[]{(byte) 0x80, 0x0c};
    }

    public static byte[] cmdReadBand(int tag) {
        return new byte[]{(byte) 0x80, 0x09, (byte) tag};
    }

    public static byte[] cmdCommit() {
        return new byte[]{0x01, 0x0a, 0x04, 0x00, 0x00, (byte) 0xff, (byte) 0xff};
    }

    public static byte[] cmdFlush() {
        return new byte[]{0x01, 0x01, 0x00};
    }

    public static byte[] cmdSaveSlot() {
        return new byte[]{0x01, 0x04, 0x00, 0x00, 0x00, 0x00};
    }

    public static byte[] cmdReadDacState() {
        return new byte[]{(byte) 0x80, 0x11};
    }

    public static byte[] cmdReadWorkMode() {
        return new byte[]{(byte) 0x80, 0x1d};
    }

    public static byte[] cmdReadOutputMode() {
        return new byte[]{(byte) 0x80, 0x19};
    }

    public static byte[] cmdReadMic() {
        return new byte[]{(byte) 0x80, 0x02, 0x00};
    }

    public static byte[] cmdSetFilter(int index) {
        return new byte[]{0x01, 0x11, 0x01, (byte) (index & 0xff)};
    }

    public static byte[] cmdSetWorkMode(int mode) {
        return new byte[]{0x01, 0x1d, 0x01, (byte) (mode == 0 ? 0 : 1)};
    }

    public static byte[] cmdSetOutputMode(int mode) {
        int v = (int) clamp(mode, 1, 3) - 1;
        return new byte[]{0x01, 0x19, 0x01, (byte) v};
    }

    public static byte[] cmdSetMic(int offset) {
        return new byte[]{0x01, 0x02, 0x02, (byte) 0x80, (byte) (offset & 0xff)};
    }

    public static byte[] cmdSetBalance(int left, int right) {
        if (left > 0) {
            return new byte[]{0x01, 0x16, 0x04, 0x01, 0x00, (byte) (-left), 0x00};
        } else if (right > 0) {
            return new byte[]{0x01, 0x16, 0x04, 0x00, 0x00, (byte) (-right), 0x00};
        }
        return new byte[]{0x01, 0x16, 0x04, 0x00, 0x01, 0x00, 0x00};
    }
}
