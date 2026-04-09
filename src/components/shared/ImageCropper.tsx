"use client";

import { useState, useCallback } from "react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import { Button } from "@/components/ui/button";
import { ZoomIn, ZoomOut, RotateCcw, Check, X } from "lucide-react";

interface ImageCropperProps {
  /** The image source URL (object URL or data URL) */
  imageSrc: string;
  /** Called with the cropped image File when user confirms */
  onCropComplete: (croppedFile: File) => void;
  /** Called when user cancels cropping */
  onCancel: () => void;
  /** Output file name (default: "cropped.jpg") */
  fileName?: string;
  /** Crop shape: "round" for profile photos, "rect" for general images (default: "rect") */
  cropShape?: "round" | "rect";
  /** Aspect ratio for the crop area (default: free crop via 0, or e.g. 16/9, 4/3, 1) */
  aspect?: number;
}

/**
 * Creates a cropped image File from a source image + crop area.
 */
async function getCroppedImg(
  imageSrc: string,
  pixelCrop: Area,
  fileName: string
): Promise<File> {
  const image = new window.Image();
  image.crossOrigin = "anonymous";

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = reject;
    image.src = imageSrc;
  });

  const canvas = document.createElement("canvas");
  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get canvas context");

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  );

  return new Promise<File>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Canvas is empty"));
          return;
        }
        resolve(new File([blob], fileName, { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.92
    );
  });
}

export function ImageCropper({
  imageSrc,
  onCropComplete,
  onCancel,
  fileName = "cropped.jpg",
  cropShape = "rect",
  aspect,
}: ImageCropperProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [processing, setProcessing] = useState(false);

  const onCropChange = useCallback(
    (_croppedArea: Area, croppedPixels: Area) => {
      setCroppedAreaPixels(croppedPixels);
    },
    []
  );

  const handleConfirm = async () => {
    if (!croppedAreaPixels) return;
    setProcessing(true);
    try {
      const croppedFile = await getCroppedImg(imageSrc, croppedAreaPixels, fileName);
      onCropComplete(croppedFile);
    } catch (err) {
      console.error("Crop failed:", err);
    } finally {
      setProcessing(false);
    }
  };

  const isRound = cropShape === "round";

  return (
    <div className="space-y-4">
      {/* Crop area */}
      <div className="relative w-full h-72 rounded-xl overflow-hidden bg-gray-900">
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          aspect={aspect || (isRound ? 1 : 16 / 9)}
          cropShape={cropShape}
          showGrid={!isRound}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropChange}
          minZoom={1}
          maxZoom={4}
        />
      </div>

      {/* Zoom controls */}
      <div className="flex items-center justify-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => setZoom((z) => Math.max(1, z - 0.2))}
          disabled={zoom <= 1}
        >
          <ZoomOut className="h-4 w-4" />
        </Button>

        <input
          type="range"
          min={1}
          max={4}
          step={0.05}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="w-32 accent-navy-900"
        />

        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => setZoom((z) => Math.min(4, z + 0.2))}
          disabled={zoom >= 4}
        >
          <ZoomIn className="h-4 w-4" />
        </Button>

        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => {
            setZoom(1);
            setCrop({ x: 0, y: 0 });
          }}
          title="Reset"
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
      </div>

      <p className="text-xs text-center text-gray-400">
        {isRound
          ? "Drag to reposition. Use zoom to fit the face in the circle."
          : "Drag to reposition. Use zoom to select the area you want."}
      </p>

      {/* Action buttons */}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} size="sm">
          <X className="h-4 w-4 mr-1" />
          Cancel
        </Button>
        <Button
          type="button"
          onClick={handleConfirm}
          disabled={processing}
          size="sm"
        >
          <Check className="h-4 w-4 mr-1" />
          {processing ? "Cropping..." : "Confirm Crop"}
        </Button>
      </div>
    </div>
  );
}
