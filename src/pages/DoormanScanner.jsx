import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import jsQR from "jsqr";
import { ArrowLeft, Search, CheckCircle2, XCircle, RotateCcw, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import TicketSalesQR from "@/components/TicketSalesQR";

export default function DoormanScanner() {
  const navigate = useNavigate();
  const [mode, setMode] = useState("scan");
  const [result, setResult] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [cameraStatus, setCameraStatus] = useState("starting"); // starting, active, error
  const [debugMsg, setDebugMsg] = useState("");
  const [event, setEvent] = useState(null);
  const [showSell, setShowSell] = useState(false);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const processingRef = useRef(false);
  const lastQrData = useRef("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const eid = params.get("event_id");
    if (eid) {
      base44.entities.Event.filter({ id: eid })
        .then((r) => setEvent(r[0] || null))
        .catch(() => {});
    }
  }, []);

  const stopEverything = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (mode !== "scan") return;

    let active = true;

    async function init() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });

        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        video.srcObject = stream;
        video.setAttribute("playsinline", true);
        video.setAttribute("muted", true);

        await new Promise((resolve) => {
          video.onloadedmetadata = resolve;
        });
        await video.play();
        setCameraStatus("active");
        setDebugMsg(`Camera: ${video.videoWidth}x${video.videoHeight}`);

        function tick() {
          if (!active || processingRef.current) {
            rafRef.current = requestAnimationFrame(tick);
            return;
          }
          if (video.readyState >= 2 && video.videoWidth > 0) {
            const canvas = canvasRef.current;
            if (canvas) {
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
              const ctx = canvas.getContext("2d", { willReadFrequently: true });
              ctx.drawImage(video, 0, 0);
              const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const code = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: "attemptBoth",
              });
              if (code && code.data) {
                setDebugMsg(`Found: ${code.data.substring(0, 20)}...`);
                handleScannedData(code.data);
                return; // stop ticking
              }
            }
          }
          rafRef.current = requestAnimationFrame(tick);
        }

        rafRef.current = requestAnimationFrame(tick);
      } catch (err) {
        setCameraStatus("error");
        setDebugMsg(`Camera error: ${err.message}`);
      }
    }

    init();

    return () => {
      active = false;
      stopEverything();
    };
  }, [mode]);

  async function handleScannedData(data) {
    if (processingRef.current) return;
    processingRef.current = true;
    setProcessing(true);
    lastQrData.current = data;
    stopEverything();

    try {
      const response = await base44.functions.invoke("validateQR", { qr_data: data });
      setResult(response.data);
      setMode("result");
    } catch {
      setResult({ valid: false, error: "Failed to validate QR code" });
      setMode("result");
    }
    setProcessing(false);
    processingRef.current = false;
  }

  async function handleManualSubmit() {
    if (!manualCode.trim()) return;
    handleScannedData(manualCode.trim());
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
    processingRef.current = false;
    setCameraStatus("starting");
    setDebugMsg("");
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-2 z-10">
        <Button variant="ghost" size="icon" className="rounded-full text-white hover:bg-white/10" onClick={() => navigate("/")}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="font-heading font-bold text-lg">Door Scanner</h1>
        {event && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto text-amber-400 hover:bg-amber-500/10 hover:text-amber-400"
            onClick={() => setShowSell(true)}
          >
            <Ticket className="w-4 h-4" /> Sell
          </Button>
        )}
      </div>

      {mode === "scan" && (
        <div className="flex-1 flex flex-col">
          {/* Camera View */}
          <div className="relative mx-4 rounded-2xl overflow-hidden bg-zinc-900" style={{ height: "55vw", maxHeight: 360 }}>
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              playsInline
              muted
              autoPlay
            />
            <canvas ref={canvasRef} className="hidden" />

            {cameraStatus === "error" && (
              <div className="absolute inset-0 flex items-center justify-center bg-zinc-900">
                <p className="text-red-400 text-sm px-4 text-center">Camera access denied or unavailable</p>
              </div>
            )}

            {/* Scanning overlay */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-56 h-56 border-2 border-white/30 rounded-3xl relative">
                <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-primary rounded-tl-xl" />
                <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-primary rounded-tr-xl" />
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-primary rounded-bl-xl" />
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-primary rounded-br-xl" />
                <div className="absolute inset-x-4 h-0.5 bg-primary/60 top-1/2 animate-pulse" />
              </div>
            </div>

            <div className="absolute bottom-2 left-0 right-0 text-center">
              <p className="text-xs text-white/60">Point at guest's QR code</p>
            </div>
          </div>

          {/* Debug status */}
          {debugMsg ? (
            <p className="text-center text-[10px] text-zinc-600 mt-1 px-4 truncate">{debugMsg}</p>
          ) : (
            <p className="text-center text-[10px] text-zinc-600 mt-1">Initializing camera...</p>
          )}

          {/* Tips */}
          <div className="px-4 pt-2">
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
            <p className="text-xs text-zinc-500 text-center">Or paste QR data manually</p>
            <div className="flex gap-2">
              <Input
                placeholder="Paste QR data..."
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                className="bg-zinc-900 border-zinc-800 text-white h-11 rounded-xl"
              />
              <Button className="h-11 rounded-xl bg-primary" onClick={handleManualSubmit} disabled={processing}>
                <Search className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {mode === "result" && result && (
        <div className="flex-1 flex flex-col items-center justify-center px-6 pb-8">
          <div className={`w-full max-w-sm rounded-3xl p-8 text-center border-2 ${
            result.valid
              ? "bg-emerald-500/10 border-emerald-500/30"
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

      {event && showSell && <TicketSalesQR event={event} onClose={() => setShowSell(false)} />}
    </div>
  );
}