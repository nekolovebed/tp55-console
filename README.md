# TP55 Console

EPZ TP55 便携解码耳放的本地调音工具，**个人自用与学习项目**。

Windows（Electron）与 Android（Java）共用同一套 10 段 PEQ 引擎和 USB HID 协议实现，全部在本机运行。

## 功能

**均衡器**

- 10 段 PEQ：峰值 / 低架 / 高架 / 低通 / 高通，20 Hz – 20 kHz，±12 dB，Q 0.1 – 10
- 拖动曲线节点实时调音，滚轮调 Q，双击复位，Shift 精调
- 6 组内置预设（平直 / 低频 / 人声 / 柔化 / 游戏 / 流行），支持保存自定义预设

**Windows 工具**

- **防吞音**：后台保持一路静音流，避免解码器空闲后吞掉开头几百毫秒
- **测试音**：1 kHz 正弦、粉红噪声、左右声道检查，播放 5 秒自动停止
- 采样率、位深、UAC 模式实时显示在工具栏

**设备**

- DAC 数字滤波器、CLASS-AB / CLASS-H、输出增益（状态从设备读回）
- 3.5mm 麦克风增益
- 固件版本、序列号、VID/PID

**其他**

- 导入 AutoEQ / EqualizerAPO 文本，导出 JSON
- 实时试听只写运行内存，点「保存到设备」才写 Flash
- 深色界面，完全离线，无遥测

## 下载

| 平台 | 文件 | 说明 |
| --- | --- | --- |
| Windows | `TP55-Console-1.1-win-x64.zip` | 解压后运行 `TP55 Console.exe`，整个文件夹需保留 |
| Android | `TP55-Console-1.1-android.apk` | Android 8.0+ |

到 [Releases](../../releases) 下载。

## 从源码运行

```bash
npm install
npm start        # 开发运行
npm run dist     # 打包 Windows
```

Android：

```bash
cd android
./gradlew :app:assembleRelease
```

> 仓库不含签名密钥；自行构建时若 `android/keystore/tp55.jks` 不存在，产物为未签名 APK，需要自行签名。

## 说明

- 本项目为个人自用与学习用途，**非官方软件**，与 EPZ 及其关联公司无任何关系
- 不抓取官方接口、不绕过任何登录、不内置官方数据或第三方程序
- 设备协议来自对公开前端代码的互操作性分析，仅用于控制自己的设备
- 官方固件更新后协议可能变化，工具可能失效

## 免责声明

1. 程序通过 USB HID 直接写入设备的 DSP 与 Flash，存在参数异常、配置丢失的风险
2. 大幅提升某频段可能削波失真，高音量下可能损伤听力或耳机单元，请从小幅度开始
3. 保存操作会写入 Flash，存在擦写寿命限制，日常试听请用实时调节
4. 防吞音会在默认输出设备上保持一路静音流，独占模式下可能失败，不影响正常播放
5. 程序按「现状」提供，不附带担保，作者不承担使用造成的损失
6. 首次启动需同意完整条款，之后可在「设备 → 免责声明」查看

## 目录

```
main.js                  Electron 主进程、IPC
lib/device.js            HID 通信与 biquad 编码
lib/sysinfo.js           采样率 / UAC 读取
lib/keepalive.js         防吞音
renderer/                桌面界面
docs/protocol.md         设备协议速查
docs/plan.md             迭代规划
android/                 Android 工程
```

## 许可

[MIT](LICENSE)
