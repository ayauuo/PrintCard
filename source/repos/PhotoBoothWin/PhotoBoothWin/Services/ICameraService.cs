using System;
using System.Threading.Tasks;
using System.Windows.Media.Imaging;

namespace PhotoBoothWin.Services
{
    public interface ICameraService : IDisposable
    {
        event EventHandler<BitmapSource>? LiveViewFrameReady;
        event EventHandler<string>? PhotoCaptured;

        bool IsConnected { get; }

        Task InitializeAsync();
        Task StartLiveViewAsync();
        Task StopLiveViewAsync();
        /// <summary>半按快門觸發對焦再放開。</summary>
        Task HalfPressShutterAsync();
        /// <summary>開始持續半按快門（對焦鎖定），倒數期間呼叫；倒數結束後須呼叫 EndHalfPressAsync 放開。</summary>
        Task StartHalfPressAsync();
        /// <summary>結束持續半按快門（放開快門鈕）。</summary>
        Task EndHalfPressAsync();
        /// <summary>觸發一次 EVF 自動對焦（DoEvfAf Off→On）。</summary>
        Task TriggerEvfAfAsync();
        /// <summary>暫停 LiveView 拉流後觸發 AF、再等鏡頭完成，避免 Busy；建議在 T=10/3/1 秒各呼叫一次。</summary>
        Task TriggerEvfAfWithPauseAsync();
        Task AutoFocusAsync();
        Task<string> TakePictureAsync(string outputDir, int index, bool restartLiveViewAfter = true);
    }
}
