import { useRef, useState } from "react";
import { QRCodeSVG, QRCodeCanvas } from "qrcode.react";
import { X, Download, Printer, Ticket, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getLinkDomain } from "@/lib/promoterRef";
import { isNative, shareUrl } from "@/lib/native";

function escapeHtml(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// A QR for DOOR STAFF to display so walk-ups can scan & buy tickets.
// This is deliberately separate from a guest's personal entry QR pass.
// The code is rendered locally (no third-party image service). On the web it
// can be downloaded or printed; in the iOS app, where the WebView cannot save
// files or open print windows, the link is shared instead.
export default function TicketSalesQR({ event, onClose }) {
  const ticketUrl = `${getLinkDomain()}/event/${event.id}/checkout`;
  const [downloading, setDownloading] = useState(false);
  const canvasWrap = useRef(null);
  const native = isNative();

  function pngDataUrl() {
    const canvas = canvasWrap.current?.querySelector("canvas");
    return canvas ? canvas.toDataURL("image/png") : null;
  }

  async function handleDownload() {
    setDownloading(true);
    try {
      const url = pngDataUrl();
      if (!url) throw new Error("no canvas");
      const a = document.createElement("a");
      a.href = url;
      a.download = `${String(event.title).replace(/[^a-z0-9]+/gi, "-")}-buy-tickets.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      // Fall back to opening the purchase link itself.
      window.open(ticketUrl, "_blank", "noopener,noreferrer");
    }
    setDownloading(false);
  }

  function handlePrint() {
    const w = window.open("", "_blank");
    if (!w) return;
    const safeTitle = escapeHtml(event.title);
    const img = pngDataUrl() || "";
    w.document.write(
      `<!doctype html><html><head><title>Scan to buy tickets — ${safeTitle}</title>` +
      `<style>body{font-family:system-ui,sans-serif;text-align:center;padding:48px;color:#0a0a0a}h2{margin:0 0 4px}p{margin:4px 0;color:#555}img{margin:16px 0}</style>` +
      `</head><body><h2>Scan to buy tickets</h2><p>${safeTitle}</p>` +
      `<img src="${img}" width="320" height="320"/>` +
      `<p style="word-break:break-all;font-size:12px">${ticketUrl}</p></body></html>`
    );
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  }

  function handleShare() {
    shareUrl({ title: `Buy tickets — ${event.title}`, text: "Scan or tap to buy tickets", url: ticketUrl });
  }

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur flex flex-col items-center justify-center px-4">
      <button onClick={onClose} className="absolute top-4 right-4 w-10 h-10 rounded-full bg-secondary flex items-center justify-center">
        <X className="w-5 h-5" />
      </button>

      <div className="bg-card rounded-3xl border border-border p-6 w-full max-w-sm text-center">
        <div className="inline-flex items-center gap-1.5 bg-amber-500/10 text-amber-400 text-[10px] font-mono uppercase tracking-widest px-2 py-1 rounded-full border border-amber-500/20 mb-3">
          <Ticket className="w-3 h-3" /> Ticket Sales
        </div>
        <h2 className="font-heading font-bold text-lg mb-1">Scan to buy tickets</h2>
        <p className="text-sm text-muted-foreground mb-4">{event.title}</p>

        <div className="w-52 h-52 bg-white rounded-2xl p-3 mx-auto mb-3">
          <QRCodeSVG value={ticketUrl} size={200} level="M" bgColor="#FFFFFF" fgColor="#000000"
            className="w-full h-full" role="img" aria-label="Ticket sales QR code" />
        </div>
        {/* Hidden high-resolution copy for download/print. */}
        <div ref={canvasWrap} className="hidden" aria-hidden="true">
          <QRCodeCanvas value={ticketUrl} size={800} level="M" bgColor="#FFFFFF" fgColor="#000000" includeMargin />
        </div>
        <p className="text-[10px] text-muted-foreground mb-5">
          This is <strong>not</strong> a guest entry pass. Scanning opens the ticket purchase page.
        </p>

        {native ? (
          <Button className="w-full h-11 rounded-xl gap-1.5" onClick={handleShare}>
            <Share2 className="w-4 h-4" /> Share ticket link
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 h-11 rounded-xl gap-1.5" onClick={handleDownload} disabled={downloading}>
              <Download className="w-4 h-4" /> {downloading ? "..." : "Download"}
            </Button>
            <Button className="flex-1 h-11 rounded-xl gap-1.5" onClick={handlePrint}>
              <Printer className="w-4 h-4" /> Print
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
