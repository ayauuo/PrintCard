using System;
using System.Drawing;
using System.Drawing.Printing;
using System.IO;

namespace PhotoBoothWin.Services
{
    /// <summary>
    /// HiTi 卡片印表機列印服務（如 HiTi CS-2、CS-200e）。
    /// 印表機名稱可透過環境變數 HITI_PRINTER_NAME 或 hiti_printer.txt 覆寫。
    /// </summary>
    public static class HitiPrinter
    {
        private const string DefaultPrinterName = "HiTi CS-200e";

        /// <summary>HiTi 印表機名稱，可透過環境變數或 hiti_printer.txt 覆寫。</summary>
        public static string PrinterName => GetPrinterName();

        private static string GetPrinterName()
        {
            var fromEnv = Environment.GetEnvironmentVariable("HITI_PRINTER_NAME");
            if (!string.IsNullOrWhiteSpace(fromEnv))
                return fromEnv.Trim();

            try
            {
                var configPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "hiti_printer.txt");
                if (File.Exists(configPath))
                {
                    var line = File.ReadAllLines(configPath)[0]?.Trim();
                    if (!string.IsNullOrWhiteSpace(line))
                        return line;
                }
            }
            catch { /* 沿用預設 */ }

            return DefaultPrinterName;
        }

        /// <summary>
        /// 將載具合成圖（PNG data URL）送去 HiTi 印表機列印。
        /// </summary>
        /// <param name="dataUrl">data:image/png;base64,... 格式</param>
        /// <returns>成功回傳 null，失敗回傳錯誤訊息</returns>
        public static string? PrintCarrierImage(string dataUrl)
        {
            if (string.IsNullOrWhiteSpace(dataUrl))
                return "dataUrl 為空";

            var commaIndex = dataUrl.IndexOf(',');
            var base64 = commaIndex >= 0 ? dataUrl[(commaIndex + 1)..] : dataUrl;
            byte[] bytes;
            try
            {
                bytes = Convert.FromBase64String(base64);
            }
            catch (Exception ex)
            {
                return $"Base64 解析失敗: {ex.Message}";
            }

            return PrintCarrierImage(bytes);
        }

        /// <summary>
        /// 將載具合成圖（PNG 位元組）送去 HiTi 印表機列印。
        /// </summary>
        public static string? PrintCarrierImage(byte[] imageBytes)
        {
            if (imageBytes == null || imageBytes.Length == 0)
                return "圖片位元組為空";

            try
            {
                using var ms = new MemoryStream(imageBytes);
                using var img = Image.FromStream(ms);
                using var pd = new PrintDocument();

                pd.PrinterSettings.PrinterName = PrinterName;

                if (!pd.PrinterSettings.IsValid)
                    return $"找不到印表機「{PrinterName}」，請在「印表機與掃描器」中確認名稱是否正確。";

                pd.DefaultPageSettings.Landscape = img.Width > img.Height;
                pd.DefaultPageSettings.Margins = new Margins(0, 0, 0, 0);

                pd.PrintPage += (s, e) =>
                {
                    var bounds = e.PageBounds;
                    e.Graphics?.DrawImage(img, bounds.X, bounds.Y, bounds.Width, bounds.Height);
                };

                pd.Print();
                return null;
            }
            catch (Exception ex)
            {
                return ex.Message;
            }
        }
    }
}
