import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Camera, Search, CheckCircle2, XCircle, AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function DoormanScanner() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const eventId = urlParams.get("event_id");
  const [mode, setMode] = useState("scan"); // scan, result
  const [result, setResult] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const scanIntervalRef = useRef(null);

  useEffect(() => {
    if (mode === "scan") {
      startCamera();
    }
    return () => stopCamera();
  }, [mode]);

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }

      // Start scanning
      scanIntervalRef.current = setInterval(() => {
        scanFrame();
      }, 500);
    } catch {
      // Camera not available
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
  }

  async function scanFrame() {
    if (!videoRef.current || !canvasRef.current || processing) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    if (video.readyState !== video.HAVE_ENOUGH_DATA) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // Use BarcodeDetector API if available
    if ("BarcodeDetector" in window) {
      try {
        const detector = new BarcodeDetector({ formats: ["qr_code"] });
        const codes = await detector.detect(imageData);
        if (codes.length > 0) {
          handleScannedData(codes[0].rawValue);
        }
      } catch {
        // Detection failed, continue scanning
      }
    }
  }

  async function handleScannedData(data) {
    if (processing) return;
    setProcessing(true);
    stopCamera();

    try {
      const response = await base44.functions.invoke("validateQR", { qr_data: data });
      setResult(response.data);
      setMode("result");
    } catch (err) {
      setResult({ valid: false, error: "Failed to validate QR code" });
      setMode("result");
    }
    setProcessing(false);
  }

  async function handleCheckIn() {
    if (!result || processing) return;
    setProcessing(true);

    // Re-validate with check_in action using the same QR data
    // We need to re-scan or use stored data
    // For simplicity, we'll directly update via the result info
    try {
      // We need the original QR data, so let's store it
      const response = await base44.functions.invoke("validateQR", {
        qr_data: lastQrData.current,
        action: "check_in",
      });
      setResult(response.data);
    } catch {
      setResult({ valid: false, error: "Check-in failed" });
    }
    setProcessing(false);
  }

  const lastQrData = useRef("");

  // Override handleScannedData to store the QR data
  const originalHandleScanned = async (data) => {
    if (processing) return;
    lastQrData.current = data;
    setProcessing(true);
    stopCamera();

    try {
      const response = await base44.functions.invoke("validateQR", { qr_data: data });
      setResult(response.data);
      setMode("result");
    } catch {
      setResult({ valid: false, error: "Failed to validate QR code" });
      setMode("result");
    }
    setProcessing(false);
  };

  // Replace the scan frame handler
  useEffect(() => {
    const handler = async () => {
      if (!videoRef.current || !canvasRef.current || processing) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (video.readyState !== video.HAVE_ENOUGH_DATA) return;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      if ("BarcodeDetector" in window) {
        try {
          const detector = new BarcodeDetector({ formats: ["qr_code"] });
          const codes = await detector.detect(imageData);
          if (codes.length > 0) {
            originalHandleScanned(codes[0].rawValue);
          }
        } catch {}
      }
    };

    if (mode === "scan") {
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = setInterval(handler, 500);
    }

    return () => {
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    };
  }, [mode, processing]);

  async function handleManualSubmit() {
    if (!manualCode.trim()) return;
    originalHandleScanned(manualCode.trim());
  }

  async function handleCheckInAction() {
    if (!lastQrData.current || processing) return;
    setProcessing(true);
    try {
      const response = await base44.functions.invoke("validateQR", {
        qr_data: lastQrData.current,
        action: "check_in",
      });
      setResult(response.data);
    } catch {
      setResult({ valid: false, error: "Check-in failed" });
    }
    setProcessing(false);
  }

  function resetScanner() {
    setResult(null);
    setMode("scan");
    setManualCode("");
    lastQrData.current = "";
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-2 z-10">
        <Button variant="ghost" size="icon" className="rounded-full text-white hover:bg-white/10" onClick={() => navigate("/")}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="font-heading font-bold text-lg">Door Scanner</h1>
      </div>

      {mode === "scan" && (
        <div className="flex-1 flex flex-col">
          {/* Camera View */}
          <div className="relative flex-1 mx-4 rounded-2xl overflow-hidden bg-zinc-900">
            <video ref={videoRef} className="w-full h-full object-cover" playsInline muted autoPlay />
            <canvas ref={canvasRef} className="hidden" />

            {/* Scanning overlay */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-64 h-64 border-2 border-white/30 rounded-3xl relative">
                <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-primary rounded-tl-xl" />
                <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-primary rounded-tr-xl" />
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-primary rounded-bl-xl" />
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-primary rounded-br-xl" />
                {/* Scan line animation */}
                <div className="absolute inset-x-4 h-0.5 bg-primary/60 top-1/2 animate-pulse" />
              </div>
            </div>

            <div className="absolute bottom-4 left-0 right-0 text-center">
              <p className="text-sm text-white/70">Point at guest's QR code</p>
            </div>
          </div>

          {/* Tips */}
          <div className="px-4 pt-3">
            <div className="grid grid-cols-3 gap-2 mb-3">
              {[
                { emoji: "📲", text: "Ask guest to show QR pass" },
                { emoji: "🔍", text: "Point camera at the code" },
                { emoji: "✅", text: "Tap Check In to confirm" },
              ].map((tip, i) => (
                <div key={i} className="bg-zinc-900 rounded-xl p-2.5 text-center border border-zinc-800">
                  <p className="text-lg mb-1">{tip.emoji}</p>
                  <p className="text-[10px] text-zinc-400 leading-tight">{tip.text}</p>
                </div>
              ))}
            </div>
          </div>
          {/* Manual entry */}
          <div className="px-4 pb-4 space-y-3">
            <p className="text-xs text-zinc-500 text-center">Or enter code manually</p>
            <div className="flex gap-2">
              <Input
                placeholder="Paste QR data..."
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                className="bg-zinc-900 border-zinc-800 text-white h-11 rounded-xl"
              />
              <Button className="h-11 rounded-xl bg-primary" onClick={handleManualSubmit}>
                <Search className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {mode === "result" && result && (
        <div className="flex-1 flex flex-col items-center justify-center px-6 pb-8">
          {/* Result Card */}
          <div className={`w-full max-w-sm rounded-3xl p-8 text-center border-2 ${
            result.valid
              ? result.checked_in
                ? "bg-emerald-500/10 border-emerald-500/30"
                : "bg-emerald-500/10 border-emerald-500/30"
              : "bg-red-500/10 border-red-500/30"
          }`}>
            {result.valid ? (
              <>
                <CheckCircle2 className="w-16 h-16 text-emerald-400 mx-auto mb-4" />
                <h2 className="font-heading font-bold text-2xl text-emerald-400 mb-1">
                  {result.checked_in ? "Checked In!" : "Valid"}
                </h2>
              </>
            ) : (
              <>
                <XCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
                <h2 className="font-heading font-bold text-2xl text-red-400 mb-1">Invalid</h2>
              </>
            )}

            {result.guest_name && (
              <p className="text-xl font-semibold text-white mt-4">{result.guest_name}</p>
            )}
            {result.event_name && (
              <p className="text-sm text-zinc-400 mt-1">{result.event_name}</p>
            )}
            {result.error && (
              <p className="text-sm text-red-400 mt-3 bg-red-500/10 rounded-xl px-4 py-2">{result.error}</p>
            )}
            {result.plus_one && (
              <p className="text-sm text-amber-400 mt-3">+1: {result.plus_one_name || "Yes"}</p>
            )}
            {result.status && !result.checked_in && (
              <p className="text-xs text-zinc-500 mt-2 uppercase tracking-wider">Status: {result.status}</p>
            )}
          </div>

          {/* Actions */}
          <div className="w-full max-w-sm mt-6 space-y-3">
            {result.valid && !result.checked_in && (
              <Button
                className="w-full h-14 rounded-xl font-bold text-lg bg-emerald-600 hover:bg-emerald-500"
                onClick={handleCheckInAction}
                disabled={processing}
              >
                {processing ? "Checking in..." : "✓ Check In Guest"}
              </Button>
            )}
            <Button
              variant="outline"
              className="w-full h-12 rounded-xl font-semibold border-zinc-700 text-white hover:bg-zinc-800"
              onClick={resetScanner}
            >
              <RotateCcw className="w-4 h-4 mr-2" /> Scan Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}