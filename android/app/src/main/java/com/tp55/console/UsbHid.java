package com.tp55.console;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.hardware.usb.UsbConstants;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbDeviceConnection;
import android.hardware.usb.UsbEndpoint;
import android.hardware.usb.UsbInterface;
import android.hardware.usb.UsbManager;
import android.hardware.usb.UsbRequest;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import java.nio.ByteBuffer;
import java.util.HashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * TP55 的 Android USB HID 通道。
 *
 * 与桌面版一致：report id 0x4B，64 字节帧。
 * 写入优先走 interrupt OUT 端点，其次走 control SET_REPORT；
 * 读取走 interrupt IN 端点。
 */
public class UsbHid {

    public interface Listener {
        void onConnected(String product, String serial);
        void onDisconnected();
        void onReport(byte[] data);
        void onError(String message);
    }

    private static final int VID = 0x3302;
    private static final int PID = 0x4383;
    private static final int REPORT_ID = 0x4B;
    private static final int REPORT_LEN = 64;
    private static final String ACTION_PERMISSION = "com.tp55.console.USB_PERMISSION";

    private final Context context;
    private final UsbManager manager;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newSingleThreadExecutor();

    private Listener listener;
    private UsbDevice device;
    private UsbDeviceConnection connection;
    private UsbInterface hidInterface;
    private UsbEndpoint inEndpoint;
    private UsbEndpoint outEndpoint;
    private UsbRequest inRequest;
    private Thread readThread;
    private volatile boolean reading;

    private BroadcastReceiver permissionReceiver;

    public UsbHid(Context context) {
        this.context = context.getApplicationContext();
        this.manager = (UsbManager) this.context.getSystemService(Context.USB_SERVICE);
    }

    public void setListener(Listener l) {
        this.listener = l;
    }

    public boolean isConnected() {
        return connection != null;
    }

    public String deviceSerial() {
        if (device == null) return "";
        try {
            return device.getSerialNumber() == null ? "" : device.getSerialNumber();
        } catch (SecurityException e) {
            return "";
        }
    }

    public UsbDevice device() {
        return device;
    }

    /* ------------------------------------------------------------------ */

    public UsbDevice findDevice() {
        if (manager == null) return null;
        HashMap<String, UsbDevice> list = manager.getDeviceList();
        for (UsbDevice d : list.values()) {
            if (d.getVendorId() == VID && d.getProductId() == PID) return d;
        }
        return null;
    }

    public boolean hasPermission(UsbDevice d) {
        return manager != null && d != null && manager.hasPermission(d);
    }

    public void requestPermission(UsbDevice d) {
        if (manager == null || d == null) return;
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
                ? PendingIntent.FLAG_MUTABLE
                : 0;
        PendingIntent pi = PendingIntent.getBroadcast(
                context, 0,
                new Intent(ACTION_PERMISSION).setPackage(context.getPackageName()),
                flags);
        registerPermissionReceiver();
        manager.requestPermission(d, pi);
    }

    private void registerPermissionReceiver() {
        if (permissionReceiver != null) return;
        permissionReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context c, Intent intent) {
                if (!ACTION_PERMISSION.equals(intent.getAction())) return;
                boolean granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false);
                if (granted) {
                    open();
                } else {
                    postError("未获得 USB 访问权限");
                }
            }
        };
        IntentFilter filter = new IntentFilter(ACTION_PERMISSION);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.registerReceiver(permissionReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            context.registerReceiver(permissionReceiver, filter);
        }
    }

    private void postError(final String msg) {
        main.post(() -> {
            if (listener != null) listener.onError(msg);
        });
    }

    /* ------------------------------------------------------------------ */

    public boolean open() {
        close();
        if (manager == null) {
            postError("系统不支持 USB Host");
            return false;
        }
        UsbDevice d = findDevice();
        if (d == null) {
            postError("未找到 TP55，请检查 USB 连接");
            return false;
        }
        if (!manager.hasPermission(d)) {
            requestPermission(d);
            return false;
        }

        UsbInterface target = null;
        for (int i = 0; i < d.getInterfaceCount(); i++) {
            UsbInterface it = d.getInterface(i);
            if (it.getInterfaceClass() == UsbConstants.USB_CLASS_HID) {
                target = it;
                break;
            }
        }
        if (target == null) {
            postError("设备没有可用的 HID 接口");
            return false;
        }

        UsbDeviceConnection conn = manager.openDevice(d);
        if (conn == null) {
            postError("打开设备失败，可能被其他应用占用");
            return false;
        }
        if (!conn.claimInterface(target, true)) {
            conn.close();
            postError("无法接管 HID 接口，请关闭其他调音应用后重试");
            return false;
        }

        UsbEndpoint in = null;
        UsbEndpoint out = null;
        for (int i = 0; i < target.getEndpointCount(); i++) {
            UsbEndpoint ep = target.getEndpoint(i);
            if (ep.getType() != UsbConstants.USB_ENDPOINT_XFER_INT) continue;
            if (ep.getDirection() == UsbConstants.USB_DIR_IN && in == null) in = ep;
            if (ep.getDirection() == UsbConstants.USB_DIR_OUT && out == null) out = ep;
        }

        device = d;
        connection = conn;
        hidInterface = target;
        inEndpoint = in;
        outEndpoint = out;

        startReadLoop();

        final String name = d.getProductName() == null ? "TP55" : d.getProductName();
        main.post(() -> {
            if (listener != null) listener.onConnected(name, deviceSerial());
        });
        return true;
    }

    public void close() {
        reading = false;
        if (inRequest != null) {
            try {
                inRequest.cancel();
            } catch (Exception ignored) {
            }
            inRequest = null;
        }
        if (readThread != null) {
            try {
                readThread.join(300);
            } catch (InterruptedException ignored) {
            }
            readThread = null;
        }
        if (connection != null) {
            try {
                if (hidInterface != null) connection.releaseInterface(hidInterface);
            } catch (Exception ignored) {
            }
            try {
                connection.close();
            } catch (Exception ignored) {
            }
            connection = null;
        }
        if (device != null) {
            device = null;
            main.post(() -> {
                if (listener != null) listener.onDisconnected();
            });
        }
    }

    public void release() {
        close();
        if (permissionReceiver != null) {
            try {
                context.unregisterReceiver(permissionReceiver);
            } catch (Exception ignored) {
            }
            permissionReceiver = null;
        }
        io.shutdownNow();
    }

    /* ------------------------------------------------------------------ */

    private void startReadLoop() {
        if (inEndpoint == null) return;
        reading = true;
        readThread = new Thread(() -> {
            UsbRequest req = new UsbRequest();
            try {
                if (!req.initialize(connection, inEndpoint)) return;
                inRequest = req;
                int size = Math.max(inEndpoint.getMaxPacketSize(), REPORT_LEN);
                ByteBuffer buffer = ByteBuffer.allocate(size);
                while (reading) {
                    buffer.clear();
                    if (!req.queue(buffer, size)) break;
                    UsbRequest done = connection.requestWait();
                    if (done != req) break;
                    int len = buffer.position();
                    if (len <= 0) continue;
                    final byte[] data = new byte[len];
                    buffer.rewind();
                    buffer.get(data, 0, len);
                    main.post(() -> {
                        if (listener != null) listener.onReport(data);
                    });
                }
            } catch (Exception e) {
                if (reading) postError("读取中断：" + e.getMessage());
            } finally {
                try {
                    req.close();
                } catch (Exception ignored) {
                }
            }
        }, "tp55-hid-read");
        readThread.start();
    }

    /** 发送一帧命令（不含 report id）。 */
    public void send(final byte[] payload) {
        if (connection == null) return;
        io.execute(() -> {
            try {
                byte[] data = new byte[REPORT_LEN];
                int n = Math.min(payload.length, REPORT_LEN - 1);
                System.arraycopy(payload, 0, data, 1, n);
                data[0] = (byte) REPORT_ID;

                if (outEndpoint != null) {
                    int r = connection.bulkTransfer(outEndpoint, data, data.length, 300);
                    if (r >= 0) return;
                }
                // control SET_REPORT：wValue 高字节=2(Output)，低字节=report id，数据不含 report id
                int r = connection.controlTransfer(
                        0x21, 0x09, (0x02 << 8) | REPORT_ID, hidInterface.getId(),
                        data, data.length, 500);
                if (r < 0) {
                    int r2 = connection.controlTransfer(
                            0x21, 0x09, (0x02 << 8) | REPORT_ID, hidInterface.getId(),
                            data, data.length - 1, 500);
                    if (r2 < 0) postError("写入失败，设备可能不支持该传输方式");
                }
            } catch (Exception e) {
                postError("写入异常：" + e.getMessage());
            }
        });
    }

    /** 主动中断并释放（退出界面时调用）。 */
    public void shutdown() {
        reading = false;
        try {
            io.shutdownNow();
        } catch (Exception ignored) {
        }
    }
}
