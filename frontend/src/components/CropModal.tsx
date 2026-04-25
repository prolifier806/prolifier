import { useState, useCallback } from "react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import { Button } from "@/components/ui/button";
import { ZoomIn, ZoomOut, X } from "lucide-react";

async function getCroppedImg(imageSrc: string, pixelCrop: Area): Promise<File> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = imageSrc;
  });

  const canvas = document.createElement("canvas");
  const size = Math.min(Math.max(pixelCrop.width, pixelCrop.height), 800);
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    img,
    pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height,
    0, 0, size, size
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => {
        if (!blob) { reject(new Error("Failed to crop image")); return; }
        resolve(new File([blob], "avatar.jpg", { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.92
    );
  });
}

interface Props {
  imageSrc: string;
  onCancel: () => void;
  onSave: (file: File) => void;
  saving?: boolean;
}

export default function CropModal({ imageSrc, onCancel, onSave, saving }: Props) {
  const [crop, setCrop]   = useState({ x: 0, y: 0 });
  const [zoom, setZoom]   = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [processing, setProcessing] = useState(false);

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const handleSave = async () => {
    if (!croppedAreaPixels || processing || saving) return;
    setProcessing(true);
    try {
      const file = await getCroppedImg(imageSrc, croppedAreaPixels);
      onSave(file);
    } catch {
      setProcessing(false);
    }
  };

  const busy = processing || saving;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={e => { if (e.target === e.currentTarget && !busy) onCancel(); }}
    >
      <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm mx-4 animate-in zoom-in-95 duration-300 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-bold text-foreground">Crop Photo</h2>
          <button
            onClick={onCancel}
            disabled={busy}
            className="h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Cropper */}
        <div className="relative bg-black" style={{ height: 300 }}>
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
            style={{
              cropAreaStyle: {
                border: "2px solid rgba(255,255,255,0.85)",
                boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
              },
            }}
          />
        </div>

        {/* Zoom slider */}
        <div className="px-5 py-3 border-t border-border flex items-center gap-3">
          <button
            onClick={() => setZoom(z => Math.max(1, +(z - 0.1).toFixed(2)))}
            className="h-8 w-8 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors shrink-0"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={e => setZoom(Number(e.target.value))}
            className="flex-1 accent-primary cursor-pointer h-1.5"
          />
          <button
            onClick={() => setZoom(z => Math.min(3, +(z + 0.1).toFixed(2)))}
            className="h-8 w-8 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors shrink-0"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Actions */}
        <div className="px-5 pb-5 flex gap-3">
          <Button variant="outline" className="flex-1 h-11" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button className="flex-1 h-11 font-semibold" onClick={handleSave} disabled={busy}>
            {busy
              ? <><div className="h-4 w-4 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin mr-2" />Uploading…</>
              : "Upload Photo"}
          </Button>
        </div>
      </div>
    </div>
  );
}
