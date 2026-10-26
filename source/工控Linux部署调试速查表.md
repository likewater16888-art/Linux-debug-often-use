# 工控 Linux（Ubuntu / Debian）调试速查表

> 适用：工业相机、线扫、采集卡、串口、NVIDIA、边缘部署、驱动与内核调试。
>
> 约定：
> 1. **命令与参数之间保留空格**
> 2. 需要权限时加上 `sudo`
> 3. 删除、修改引导、写入设备文件务必谨慎
> 4. 修改用户组后，注销或重启才能生效

---

# 第一部分｜日常精简常用版

适合现场调试、换工装、排查相机 / 串口 / 网络。

## 一、基础目录

| 命令 | 全称 | 示例 | 用途 |
|---|---|---|---|
| `ls` | list | `ls -l /opt` | 查看文件、权限 |
| `cd` | change directory | `cd /opt` / `cd -` | 切换；返回上一次路径 |
| `pwd` | print working directory | `pwd` | 当前路径 |
| `mkdir` | make directory | `mkdir -p /opt/camera/log` | 创建多级目录 |
| `cp` | copy | `cp -r source dest` | 复制 |
| `mv` | move | `mv old new` | 移动 / 重命名 |
| `rm` | remove | `rm *.log` | 删除；慎用 `rm -rf` |

```bash
# 给 /opt 开放读写（工控最常用）
sudo chmod -R 777 /opt
```

## 二、设备权限

```bash
# 串口、USB、相机（执行一次）
sudo usermod -aG dialout,plugdev,video $USER
```

| 组 | 作用 |
|---|---|
| `dialout` | 串口（`ttyUSB` / `ttyACM`） |
| `plugdev` | USB、热插拔设备 |
| `video` | V4L2、采集卡、相机 |

## 三、U 盘与 exFAT

解决 Windows U 盘挂载失败。

```bash
sudo apt install exfat-fuse exfat-utils
```

手动挂载

```bash
sudo mount /dev/sdb1 /mnt
sudo umount /mnt
```

## 四、串口调试

```bash
ls /dev/ttyUSB*
ls /dev/ttyACM*
```

用固定 ID（推荐，防止重启漂移）

```bash
ls -l /dev/serial/by-id/
```

实时监控设备插拔

```bash
dmesg -w
```

查看串口参数

```bash
sudo setserial -g /dev/ttyUSB0
```

## 五、采集卡 / V4L2 / 相机

安装工具

```bash
sudo apt install v4l-utils
```

枚举所有相机与采集卡

```bash
v4l2-ctl --list-devices
```

查看分辨率、像素格式、帧率

```bash
v4l2-ctl --list-formats-ext
```

查看视频节点

```bash
ls /dev/video*
ls /dev/media*
```

过滤视频驱动报错

```bash
dmesg | grep -i video
```

预览相机

```bash
ffplay -f v4l2 /dev/video0
```

录制相机

```bash
ffmpeg -f v4l2 -framerate 25 -video_size 1920x1080 -i /dev/video0 camera.mp4
```

## 六、显卡与 NVIDIA

```bash
lspci | grep -i vga
lspci -nnk | grep -i vga -A 3
nvidia-smi
sudo dkms status
```

## 七、USB

```bash
lsusb
lsusb -v
```

## 八、网络

```bash
ip addr
ip route
ping -c 4 192.168.1.1
sudo ss -tulnp
ethtool eth0
curl --head http://127.0.0.1:8080
wget -c https://example.com/file.tar.gz
```

## 九、系统与资源

```bash
uname -a
uname -r
df -h
free -h
uptime
htop
```

安装

```bash
sudo apt install htop
```

## 十、日志排查

```bash
journalctl -b
journalctl -xe
journalctl -f
sudo journalctl -b | grep -iE "usb|tty|v4l2|video|nvidia|firmware|capture"
```

## 十一、媒体、截图、录屏

### VLC

```bash
sudo apt install vlc
vlc test.mp4
vlc rtsp://192.168.1.60:554/stream
cvlc rtsp://192.168.1.60:554/stream
```

### Flameshot（推荐截图）

```bash
sudo apt install flameshot
flameshot gui
flameshot gui -p /opt/camera/snapshot.png
```

### FFmpeg

```bash
sudo apt install ffmpeg
ffmpeg -f x11grab -r 25 -s 1920x1080 -i :0.0 screen.mp4
ffmpeg -f v4l2 -framerate 25 -video_size 1920x1080 -i /dev/video0 camera.mp4
ffplay -f v4l2 /dev/video0
```

## 十二、服务管理

```bash
sudo systemctl restart udev
sudo systemctl status nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

## 十三、工控一键初始化脚本

保存为 `setup.sh`。

```bash
#!/bin/bash

sudo apt update
sudo apt full-upgrade -y

sudo apt install -y \
  tree \
  htop \
  v4l-utils \
  exfat-fuse exfat-utils \
  traceroute \
  ethtool \
  flameshot \
  simplescreenrecorder \
  ffmpeg \
  vlc

sudo usermod -aG dialout,plugdev,video "$USER"

echo "完成。请注销或重启，使设备组生效。"
```

执行

```bash
chmod +x setup.sh
./setup.sh
```

## 十四、快速诊断组合

硬件检查

```bash
lspci -nnk | grep -i vga -A 3
lsusb
ls -l /dev/serial/by-id/
v4l2-ctl --list-devices
```

网络检查

```bash
ip addr
ip route
ethtool eth0
sudo ss -tulnp
```

驱动与内核

```bash
uname -r
sudo dkms status
journalctl -b | grep -iE "v4l2|usb|firmware|tty"
```

相机预览

```bash
ffplay -f v4l2 /dev/video0
vlc rtsp://192.168.1.60:554/stream
```

---

# 第二部分｜完整版

适合部署、内核更换、驱动编译、批量迁移、长期维护。

## 一、文件与目录

| 命令 | 全称 | 使用示例 | 说明 |
|---|---|---|---|
| `ls` | list | `ls /dev` / `ls -l /opt` | 列出内容与权限 |
| `cd` | change directory | `cd /opt` / `cd -` | 切换 / 返回上次路径 |
| `pwd` | print working directory | `pwd` | 当前路径 |
| `mkdir` | make directory | `mkdir -p /opt/camera/log` | 创建多级目录 |
| `cp` | copy | `cp file /opt` / `cp -r dir dest` | 复制 |
| `mv` | move | `mv old new` | 移动 / 重命名 |
| `rm` | remove | `rm *.log` / `rm -rf folder` | 删除 |
| `stat` | status | `stat /dev/video0` | 文件 / 设备详细属性 |
| `file` | file | `file binary.run` | 判断文件类型 |

以树状查看目录

```bash
sudo apt install tree
tree -L 2 /opt
```

## 二、权限

| 命令 | 全称 | 使用示例 | 说明 |
|---|---|---|---|
| `sudo` | super user do | `sudo command` | 管理员执行 |
| `chmod` | change mode | `sudo chmod 755 file` | 修改权限 |
| `chown` | change owner | `sudo chown user file` | 修改所有者 |
| `chgrp` | change group | `sudo chgrp video /dev/video0` | 修改所属组 |
| `umask` | user mask | `umask` | 默认权限掩码 |

递归设置

```bash
sudo chmod -R 755 /opt/bin
sudo chown -R $USER:$USER /opt
```

设备临时授权

```bash
sudo chmod 666 /dev/ttyUSB0
sudo chmod 666 /dev/video0
```

> 生产环境优先使用 `usermod`，避免每次手动授权。

## 三、用户与组

```bash
sudo usermod -aG dialout,plugdev,video $USER
groups
getent group video
```

## 四、磁盘与文件系统

| 命令 | 全称 | 使用示例 | 说明 |
|---|---|---|---|
| `df` | disk free | `df -h` | 磁盘占用 |
| `du` | disk usage | `du -sh /opt` | 目录大小 |
| `fdisk` | fixed disk | `sudo fdisk -l` | 磁盘与分区 |
| `blkid` | block id | `blkid` | 分区唯一标识 |
| `mkfs.ext4` | make filesystem | `sudo mkfs.ext4 /dev/sdb1` | 创建分区 |
| `fsck` | file system check | `sudo fsck -n /dev/sdb1` | 文件系统检查 |

```bash
lsblk
sudo mount /dev/sdb1 /mnt
sudo umount /mnt
sudo dmesg | grep -i mount
```

## 五、打包与解压

| 命令 | 全称 | 使用示例 | 说明 |
|---|---|---|---|
| `tar` | tape archive | `tar -xf package.tar.gz` | 打包 / 解压 |
| `gzip` | GNU zip | `gzip file` | 压缩 |
| `gunzip` | gunzip | `gunzip file.gz` | 解压 |
| `bzip2` | bzip2 | `bzip2 file` | 高压缩率 |
| `xz` | XZ | `xz file` | 最高压缩率 |

```bash
tar -xf package.tar.gz
tar -cf archive.tar /opt/camera
tar -czf archive.tar.gz /opt/camera
tar -tf archive.tar.gz
```

## 六、PCI、显卡、FPGA

```bash
lspci
lspci | grep -i vga
lspci -nnk | grep -i vga -A 3
lspci | grep -E "FPGA|Ethernet|Capture"
nvidia-smi
watch -n 1 nvidia-smi
dpkg --list | grep nvidia
```

## 七、USB

```bash
lsusb
lsusb -v
lsusb | grep "Basler"
lsusb | grep "FLIR"
lsusb | grep "Silicon"
usb-devices
dmesg -w
```

## 八、串口

```bash
ls /dev/ttyS*
ls /dev/ttyUSB*
ls /dev/ttyACM*
ls -l /dev/serial/by-id/
sudo setserial -g /dev/ttyUSB0
```

测试连通性

```bash
sudo apt install picocom
picocom /dev/ttyUSB0 -b 115200
```

> 退出：`Ctrl + A`，然后 `Ctrl + X`。

如需简单收发

```bash
sudo apt install minicom
```

## 九、V4L2、采集卡、工业相机

```bash
sudo apt install v4l-utils
v4l2-ctl --list-devices
v4l2-ctl --list-formats-ext
v4l2-ctl --list-ctrls
v4l2-ctl --get-ctrl brightness
v4l2-ctl --get-ctrl gain
v4l2-ctl --get-ctrl exposure
v4l2-ctl --set-ctrl exposure=150
v4l2-ctl --set-ctrl gain=64
```

```bash
ls /dev/video*
ls /dev/media*
cat /sys/class/video4linux/video0/name
```

抓取一帧

```bash
ffmpeg \
  -f v4l2 \
  -video_size 1920x1080 \
  -framerate 25 \
  -i /dev/video0 \
  -frames:v 1 \
  snapshot.png
```

预览

```bash
ffplay -f v4l2 /dev/video0
```

录制

```bash
ffmpeg \
  -f v4l2 \
  -video_size 1920x1080 \
  -framerate 25 \
  -i /dev/video0 \
  -c:v libx264 \
  camera.mp4
```

## 十、内核、DKMS、驱动模块

```bash
uname -a
uname -r
uname -m
dpkg --list | grep linux-image
```

DKMS

```bash
sudo dkms status
sudo dkms build module-name / module-version
sudo dkms install module-name / module-version
sudo dkms remove module-name / module-version
```

模块

```bash
lsmod
lsmod | grep v4l2
lsmod | grep nvidia
lsmod | grep serial
sudo modprobe v4l2loopback
sudo modprobe -r v4l2loopback
modinfo v4l2loopback
```

更新内核

```bash
sudo apt update
sudo apt full-upgrade
sudo apt install linux-generic
sudo update-grub
sudo reboot
```

重启后检查

```bash
uname -r
sudo dkms status
```

如果驱动没有自动编译

```bash
sudo dkms build $(sudo dkms status | grep -E "added|built" | head -1)
sudo dkms install $(sudo dkms status | grep -E "added|built" | head -1)
```

## 十一、网络

| 命令 | 全称 | 使用示例 | 说明 |
|---|---|---|---|
| `ip` | Internet Protocol | `ip addr` | 网卡、地址 |
| `ping` | Packet Internet Groper | `ping -c 4 host` | 连通测试 |
| `traceroute` | trace route | `traceroute host` | 链路定位 |
| `ss` | socket statistics | `sudo ss -tulnp` | 端口与进程 |
| `curl` | client URL | `curl --head url` | HTTP / API |
| `wget` | web get | `wget -c url` | 文件下载 |
| `ethtool` | Ethernet tool | `ethtool eth0` | 网卡硬件信息 |
| `dig` | domain information groper | `dig baidu.com` | DNS 查询 |

```bash
ip addr
ip route
ip link
sudo ip link set eth0 up
sudo ip link set eth0 down
sudo ss -tulnp
sudo ss -tan
sudo ss -un
curl --connect-timeout 3 --head http://127.0.0.1:8080
ethtool eth0
```

NetworkManager（如果启用）

```bash
nmcli device status
nmcli connection show
sudo nmcli connection modify "connection-name" \
  ipv4.addresses "192.168.1.100/24" \
  ipv4.gateway "192.168.1.1" \
  ipv4.dns "223.5.5.5" \
  ipv4.method manual
sudo nmcli connection up "connection-name"
```

## 十二、防火墙

```bash
sudo apt install ufw
sudo ufw allow 22
sudo ufw allow 80
sudo ufw allow 554
sudo ufw status
sudo iptables -L
```

## 十三、进程、监控

| 命令 | 全称 | 使用示例 | 说明 |
|---|---|---|---|
| `ps` | process | `ps aux` | 进程列表 |
| `top` | table of processes | `top` | 实时监控 |
| `htop` | htop | `htop` | 增强监控 |
| `pgrep` | process grep | `pgrep ffmpeg` | 按名称查找 PID |
| `pidof` | pid of | `pidof vlc` | 获取进程 ID |
| `nice` | nice | `nice -n 10 command` | 设置调度优先级 |
| `renice` | renice | `sudo renice 5 -p 1234` | 修改运行优先级 |

```bash
pgrep ffmpeg
pidof simplescreenrecorder
kill 1234
kill -9 1234
pkill ffmpeg
```

打开文件与设备

```bash
sudo apt install lsof
sudo lsof /dev/video0
sudo lsof /dev/ttyUSB0
sudo lsof -i :8080
```

## 十四、日志

| 命令 | 全称 | 使用示例 | 说明 |
|---|---|---|---|
| `journalctl` | journal control | `journalctl -xe` | 系统日志 |
| `dmesg` | display message | `dmesg` | 内核消息 |
| `last` | last | `last` | 用户登录记录 |
| `who` | who | `who` | 当前会话 |

```bash
journalctl -b
journalctl -xe
journalctl -f
journalctl --since "1h ago"
sudo journalctl -b | grep -iE "usb|tty|v4l2|video|nvidia|firmware|capture"
sudo journalctl -b | grep -i failed
```

## 十五、Systemd 服务

```bash
sudo systemctl status nginx
sudo systemctl start nginx
sudo systemctl stop nginx
sudo systemctl restart nginx
sudo systemctl enable nginx
sudo systemctl disable nginx
sudo systemctl --failed
sudo systemctl list-dependencies nginx
sudo systemctl restart udev
sudo udevadm control --reload
sudo udevadm trigger
```

## 十六、媒体

### VLC

```bash
sudo apt install vlc
vlc video.mp4
vlc rtsp://192.168.1.60:554/stream
cvlc rtsp://192.168.1.60:554/stream
cvlc rtsp://192.168.1.60:554/stream --sout "file/mp4:record.mp4"
```

### FFmpeg

```bash
sudo apt install ffmpeg
ffplay -f v4l2 /dev/video0
ffmpeg \
  -f v4l2 \
  -video_size 1920x1080 \
  -framerate 25 \
  -i /dev/video0 \
  camera.mp4
ffmpeg \
  -f x11grab \
  -r 25 \
  -s 1920x1080 \
  -i :0.0 \
  screen.mp4
ffmpeg \
  -f v4l2 \
  -video_size 1920x1080 \
  -framerate 25 \
  -i /dev/video0 \
  -c:v libx264 \
  -preset fast \
  -f rtsp \
  rtsp://127.0.0.1:8554/live
ffmpeg -i input.mp4 output.mkv
ffmpeg -i video.mp4 audio.mp3
```

### SimpleScreenRecorder

```bash
sudo apt install simplescreenrecorder
simplescreenrecorder
```

### Flameshot

```bash
sudo apt install flameshot
flameshot gui
flameshot gui -p /opt/camera/snapshot.png
flameshot gui -c
```

### scrot

```bash
sudo apt install scrot
scrot /opt/screen.png
scrot -d 3 /opt/screen.png
```

## 十七、远程桌面

### XRDP

```bash
sudo apt install xrdp
sudo systemctl enable --now xrdp
sudo systemctl status xrdp
sudo ufw allow 3389
```

### VNC

```bash
sudo apt install tightvncserver
vncserver
vncserver :1
vncserver -kill :1
```

## 十八、文件查找

```bash
find /opt -name "*.run"
find /opt -type f -size +100M
find /opt -mtime -7
sudo apt install mlocate
sudo updatedb
locate v4l2-ctl
```

## 十九、批量操作

```bash
sudo apt install rename
rename 's/old/new/' *.png
```

批量抓取相机帧

```bash
mkdir -p frames

for i in {0..29}; do
  ffmpeg \
    -f v4l2 \
    -video_size 1920x1080 \
    -framerate 25 \
    -i /dev/video0 \
    -frames:v 1 \
    "frames/frame_$(printf "%03d" "$i").png"
  sleep 0.2
done
```

## 二十、调试组合

硬件诊断

```bash
lspci -nnk | grep -i vga -A 3
lsusb
ls -l /dev/serial/by-id/
v4l2-ctl --list-devices
v4l2-ctl --list-formats-ext
ls /dev/video*
ls /dev/media*
```

网络诊断

```bash
ip addr
ip route
ethtool eth0
sudo ss -tulnp
curl --connect-timeout 3 --head http://127.0.0.1:8080
```

驱动与内核

```bash
uname -r
sudo dkms status
journalctl -b | grep -iE "v4l2|usb|firmware|tty|nvidia"
```

相机调试

```bash
v4l2-ctl --list-devices
v4l2-ctl --list-ctrls
ffplay -f v4l2 /dev/video0
ffmpeg \
  -f v4l2 \
  -video_size 1920x1080 \
  -framerate 25 \
  -i /dev/video0 \
  -frames:v 1 \
  snapshot.png
```

资源监控

```bash
htop
watch -n 1 nvidia-smi
free -h
df -h
```

---

# 安全与规范

## 权限原则

| 场景 | 推荐做法 |
|---|---|
| `/opt` | 使用 `chmod` / `chown` |
| `/dev/video*` | 使用 `video` 组 |
| `/dev/ttyUSB*` | 使用 `dialout` 组 |
| USB / 热插拔 | 使用 `plugdev` 组 |
| 临时测试 | 使用 `sudo` |
| 长期项目 | 使用用户组 |

## 避坑清单

| 操作 | 风险 | 建议 |
|---|---|---|
| `rm -rf /` | 彻底销毁系统 | 永远不要执行 |
| `mkfs` | 擦除分区 | 确认设备路径 |
| `modprobe` | 可能导致设备异常 | 在调试环境测试 |
| `sudo` | 滥用容易破坏权限 | 能不用就不用 |
| 内核升级 | DKMS 驱动可能失效 | 提前检查相机、采集卡、显卡 |
| 串口路径 | `ttyUSB0` 可能漂移 | 使用 `/dev/serial/by-id/` |

## 推荐顺序（新装工控机）

```bash
# 1. 更新
sudo apt update
sudo apt full-upgrade -y

# 2. 安装工具
sudo apt install -y \
  tree \
  htop \
  v4l-utils \
  exfat-fuse exfat-utils \
  traceroute \
  ethtool \
  flameshot \
  simplescreenrecorder \
  ffmpeg \
  vlc

# 3. 设置设备组
sudo usermod -aG dialout,plugdev,video $USER

# 4. 设置 /opt
sudo mkdir -p /opt
sudo chown -R $USER:$USER /opt
sudo chmod -R 775 /opt

# 5. 重启或注销
reboot
```

## 设备未被识别时依次检查

```bash
dmesg -w
sudo udevadm control --reload
sudo udevadm trigger
sudo systemctl restart udev
groups
sudo chmod 666 /dev/video0
sudo chmod 666 /dev/ttyUSB0
```

---

# 快速索引

| 如果遇到 | 优先命令 |
|---|---|
| 相机找不到 | `v4l2-ctl --list-devices` |
| 采集卡没有画面 | `v4l2-ctl --list-formats-ext` |
| 曝光 / 增益不对 | `v4l2-ctl --list-ctrls` |
| 串口总是变号 | `ls -l /dev/serial/by-id/` |
| 不能打开 `/dev/video0` | `groups`、`usermod` |
| 网速跑不满 | `ethtool eth0` |
| 端口被占用 | `sudo ss -tulnp` |
| 驱动编译失败 | `sudo dkms status` |
| 内核升级后相机失效 | `sudo dkms build` |
| 设备插上没有反应 | `dmesg -w` |
| 需要保存缺陷画面 | `flameshot` |
| 需要录制调试过程 | `simplescreenrecorder` / `ffmpeg` |
| 需要预览工业相机流 | `vlc` / `ffplay` |
