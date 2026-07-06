using System.Diagnostics;
using System.Net.NetworkInformation;
using System.Runtime.InteropServices;

namespace NullTab.MusicServer.Services;

/// <summary>
/// Real machine stats for the dashboard's System pane. CPU and network
/// speed are computed from deltas between successive calls, so the
/// values sharpen with a steady polling interval (the UI polls every 2s).
/// </summary>
public sealed class SystemStatsService
{
    private readonly object _lock = new();

    private ulong _prevIdle, _prevKernel, _prevUser;
    private long _prevRx = -1, _prevTx = -1;
    private DateTime _prevNetAt = DateTime.MinValue;
    private double _lastCpu, _lastDown, _lastUp;

    public object Snapshot()
    {
        lock (_lock)
        {
            SampleCpu();
            SampleNetwork();

            GetMemory(out var totalMb, out var availMb);

            var root = Path.GetPathRoot(Environment.SystemDirectory) ?? "C:\\";
            var drive = new DriveInfo(root);
            var totalGb = drive.TotalSize / 1e9;
            var freeGb = drive.AvailableFreeSpace / 1e9;

            return new
            {
                cpu = Math.Round(_lastCpu, 1),
                mem = new { totalMb, usedMb = totalMb - availMb },
                disk = new { totalGb = Math.Round(totalGb, 1), freeGb = Math.Round(freeGb, 1), root },
                net = new { downMbps = Math.Round(_lastDown, 2), upMbps = Math.Round(_lastUp, 2) },
                uptimeSec = Environment.TickCount64 / 1000,
                processes = Process.GetProcesses().Length,
            };
        }
    }

    private void SampleCpu()
    {
        if (!GetSystemTimes(out var idleFt, out var kernelFt, out var userFt)) return;

        var idle = ToUlong(idleFt);
        var kernel = ToUlong(kernelFt);   // includes idle time
        var user = ToUlong(userFt);

        if (_prevKernel != 0)
        {
            var idleD = idle - _prevIdle;
            var totalD = (kernel - _prevKernel) + (user - _prevUser);
            if (totalD > 0)
                _lastCpu = Math.Clamp(100.0 * (totalD - idleD) / totalD, 0, 100);
        }
        (_prevIdle, _prevKernel, _prevUser) = (idle, kernel, user);
    }

    private void SampleNetwork()
    {
        long rx = 0, tx = 0;
        foreach (var nic in NetworkInterface.GetAllNetworkInterfaces())
        {
            if (nic.OperationalStatus != OperationalStatus.Up) continue;
            if (nic.NetworkInterfaceType == NetworkInterfaceType.Loopback) continue;
            var s = nic.GetIPv4Statistics();
            rx += s.BytesReceived;
            tx += s.BytesSent;
        }

        var now = DateTime.UtcNow;
        if (_prevRx >= 0)
        {
            var sec = (now - _prevNetAt).TotalSeconds;
            if (sec > 0.2)
            {
                _lastDown = Math.Max(0, (rx - _prevRx) * 8 / 1e6 / sec);
                _lastUp = Math.Max(0, (tx - _prevTx) * 8 / 1e6 / sec);
            }
        }
        (_prevRx, _prevTx, _prevNetAt) = (rx, tx, now);
    }

    private static void GetMemory(out long totalMb, out long availMb)
    {
        var mem = new MEMORYSTATUSEX();
        if (GlobalMemoryStatusEx(mem))
        {
            totalMb = (long)(mem.ullTotalPhys / 1_048_576);
            availMb = (long)(mem.ullAvailPhys / 1_048_576);
        }
        else
        {
            totalMb = availMb = 0;
        }
    }

    private static ulong ToUlong(System.Runtime.InteropServices.ComTypes.FILETIME ft) =>
        ((ulong)(uint)ft.dwHighDateTime << 32) | (uint)ft.dwLowDateTime;

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetSystemTimes(
        out System.Runtime.InteropServices.ComTypes.FILETIME idle,
        out System.Runtime.InteropServices.ComTypes.FILETIME kernel,
        out System.Runtime.InteropServices.ComTypes.FILETIME user);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
    private sealed class MEMORYSTATUSEX
    {
        public uint dwLength = (uint)Marshal.SizeOf<MEMORYSTATUSEX>();
        public uint dwMemoryLoad;
        public ulong ullTotalPhys;
        public ulong ullAvailPhys;
        public ulong ullTotalPageFile;
        public ulong ullAvailPageFile;
        public ulong ullTotalVirtual;
        public ulong ullAvailVirtual;
        public ulong ullAvailExtendedVirtual;
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GlobalMemoryStatusEx([In, Out] MEMORYSTATUSEX lpBuffer);
}
