"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { CloudUpload, ShieldAlert, ShieldCheck, X } from "lucide-react";

export interface CoverImageValue {
  url: string;
  cdn_public_id: string;
  width: number;
  height: number;
  alt_text?: string;
}

type UiState = "idle" | "uploading" | "processing" | "verified" | "error";

interface CoverImageUploaderProps {
  value: CoverImageValue | null;
  onChange: (value: CoverImageValue | null) => void;
  altText: string;
  onAltTextChange: (text: string) => void;
}

export default function CoverImageUploader({ value, onChange, altText, onAltTextChange }: CoverImageUploaderProps) {
  const [uiState, setUiState] = useState<UiState>(value ? "verified" : "idle");
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  useEffect(() => {
    return () => {
      if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    };
  }, [localPreviewUrl]);

  function reset() {
    xhrRef.current?.abort();
    xhrRef.current = null;
    setUiState(value ? "verified" : "idle");
    setProgress(0);
    setErrorMessage(null);
    if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    setLocalPreviewUrl(null);
  }

  function handleFile(file: File | null | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setErrorMessage("Please choose an image file.");
      setUiState("error");
      return;
    }

    setFileName(file.name);
    setLocalPreviewUrl(URL.createObjectURL(file));
    setProgress(0);
    setErrorMessage(null);
    setUiState("uploading");

    const formData = new FormData();
    formData.append("file", file);

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const pct = Math.round((event.loaded / event.total) * 100);
      setProgress(pct);
      // The transfer is done; the server is now doing the real signature check,
      // re-encode, and dimension validation — that wait IS the "processing" state.
      if (pct >= 100) setUiState("processing");
    };

    xhr.onload = () => {
      xhrRef.current = null;
      let data: { url?: string; cdn_public_id?: string; width?: number; height?: number; error?: string } | null =
        null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        data = null;
      }

      if (xhr.status >= 200 && xhr.status < 300 && data?.url && data.cdn_public_id) {
        onChange({ url: data.url, cdn_public_id: data.cdn_public_id, width: data.width ?? 0, height: data.height ?? 0 });
        setUiState("verified");
      } else {
        setErrorMessage(data?.error ?? "Upload failed. Please try again.");
        setUiState("error");
      }
    };

    xhr.onerror = () => {
      xhrRef.current = null;
      setErrorMessage("Upload failed. Please check your connection and try again.");
      setUiState("error");
    };

    xhr.open("POST", "/api/admin/upload-image");
    xhr.send(formData);
  }

  function handleCancel() {
    reset();
  }

  function handleRemove() {
    onChange(null);
    xhrRef.current?.abort();
    xhrRef.current = null;
    setUiState("idle");
    setProgress(0);
    setErrorMessage(null);
    if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    setLocalPreviewUrl(null);
  }

  return (
    <div className="flex flex-col gap-sm">
      {/* A <span>, not <label> — this heading describes the whole widget (drop zone +
          alt-text field below), not one specific control it could be htmlFor-bound to. */}
      <span className="font-meta-caps text-admin-meta-caps text-admin-on-surface-variant">Featured Image</span>
      <p className="font-ui-label-sm text-admin-ui-label-sm text-admin-on-surface-variant">
        Drag and drop a high-resolution JPG, PNG, or WEBP. Minimum dimensions: {1440}x{900}px.
      </p>

      {uiState === "idle" && (
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragOver(false);
            handleFile(event.dataTransfer.files?.[0]);
          }}
          className={`group relative flex h-40 w-full cursor-pointer flex-col items-center justify-center gap-sm rounded-lg border-2 border-dashed transition-colors duration-300 ${
            isDragOver
              ? "border-admin-primary bg-admin-surface-container-low"
              : "border-admin-outline-variant hover:border-admin-primary hover:bg-admin-surface-container-low"
          }`}
        >
          <CloudUpload className="h-8 w-8 text-admin-on-surface-variant transition-colors duration-200 group-hover:text-admin-primary" />
          <div className="font-ui-label-md text-admin-ui-label-md text-admin-on-surface">
            Select a file or drag and drop here
          </div>
          <div className="font-ui-label-sm text-admin-ui-label-sm text-admin-on-surface-variant">
            JPG, PNG, WEBP up to 10MB
          </div>
          <input
            type="file"
            accept="image/*"
            onChange={(event) => handleFile(event.target.files?.[0])}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </div>
      )}

      {uiState === "uploading" && (
        <div className="flex w-full flex-col gap-sm">
          <div className="mb-xs flex items-end justify-between">
            <div className="truncate font-ui-label-md text-admin-ui-label-md text-admin-on-surface">
              Uploading {fileName}...
            </div>
            <div className="shrink-0 font-ui-label-sm text-admin-ui-label-sm text-admin-on-surface-variant">
              {progress}%
            </div>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full border border-admin-outline-variant bg-admin-surface-container-highest">
            <div
              className="progress-bar-ease h-full rounded-full bg-admin-primary"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {uiState === "processing" && (
        <div className="w-full overflow-hidden rounded-lg border border-admin-outline-variant bg-admin-surface">
          <div className="relative h-40 w-full bg-admin-surface-container-low">
            <div className="shimmer absolute inset-0 z-10 opacity-80" />
            {localPreviewUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- transient local blob preview, not a next/image-optimizable remote asset
              <img src={localPreviewUrl} alt="" className="h-full w-full object-cover blur-sm grayscale" />
            )}
          </div>
          <div className="flex items-center justify-between border-t border-admin-outline-variant bg-admin-surface-bright p-md">
            <div className="flex items-center gap-sm">
              <ShieldAlert className="h-5 w-5 animate-pulse text-admin-outline-variant" />
              <div className="flex flex-col">
                <span className="font-ui-label-md text-admin-ui-label-md text-admin-on-surface">
                  Security &amp; Integrity Scan
                </span>
                <span className="font-ui-label-sm text-admin-ui-label-sm text-admin-on-surface-variant">
                  Verifying file signature and metadata...
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleCancel}
              className="font-ui-label-md text-admin-ui-label-md text-admin-primary transition-colors hover:text-admin-on-surface-variant"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {uiState === "verified" && value && (
        <div className="flex flex-col gap-sm">
          <div className="w-full overflow-hidden rounded-lg border border-admin-outline-variant bg-admin-surface">
            <div className="relative h-40 w-full bg-admin-surface-container-low">
              <Image src={value.url} alt={value.alt_text ?? ""} fill className="object-cover" />
              <button
                type="button"
                onClick={handleRemove}
                aria-label="Remove cover image"
                title="Remove"
                className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80 focus:outline-none focus:ring-2 focus:ring-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center gap-sm border-t border-admin-outline-variant bg-admin-surface-bright p-md">
              <ShieldCheck className="h-5 w-5 text-admin-primary" />
              <div className="flex flex-col">
                <span className="font-ui-label-md text-admin-ui-label-md text-admin-on-surface">Asset Verified</span>
                <span className="font-ui-label-sm text-admin-ui-label-sm text-admin-on-surface-variant">
                  Ready for publication · {value.width}x{value.height}px
                </span>
              </div>
            </div>
          </div>
          <input
            type="text"
            aria-label="Cover image alt text"
            value={altText}
            onChange={(event) => onAltTextChange(event.target.value)}
            placeholder="Alt text (required before publishing)"
            className="w-full rounded border border-hairline bg-admin-surface px-sm py-sm font-ui-label-sm text-admin-ui-label-sm transition-colors focus:border-admin-primary focus:outline-none focus:ring-0"
          />
        </div>
      )}

      {uiState === "error" && (
        <div className="flex flex-col items-center gap-sm rounded-lg border border-dashed border-red-300 bg-red-50 p-md text-center">
          <ShieldAlert className="h-6 w-6 text-red-600" />
          <p className="font-ui-label-sm text-admin-ui-label-sm text-red-700">{errorMessage}</p>
          <button
            type="button"
            onClick={reset}
            className="font-ui-label-md text-admin-ui-label-md text-admin-primary underline underline-offset-4"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
