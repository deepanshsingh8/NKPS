"use client";

import { useState, useRef, useCallback } from "react";
import { Upload, X, FileText, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileDropZoneProps {
  accept: string;
  multiple?: boolean;
  maxSizeMB?: number;
  onChange: (files: FileList | null) => void;
  value: FileList | File | null;
  label?: string;
  hint?: string;
  icon?: "pdf" | "image";
}

export function FileDropZone({
  accept,
  multiple = false,
  maxSizeMB = 10,
  onChange,
  value,
  label = "Drop files here or click to browse",
  hint,
  icon = "image",
}: FileDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const dt = e.dataTransfer;
      if (dt.files.length > 0) {
        onChange(dt.files);
      }
    },
    [onChange]
  );

  const handleClick = () => inputRef.current?.click();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.files);
  };

  const clearFiles = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  // Get file count and names
  const fileCount =
    value instanceof FileList ? value.length : value ? 1 : 0;
  const fileNames: string[] = [];
  if (value instanceof FileList) {
    for (let i = 0; i < value.length; i++) {
      fileNames.push(value[i].name);
    }
  } else if (value instanceof File) {
    fileNames.push(value.name);
  }

  const IconComponent = icon === "pdf" ? FileText : ImageIcon;

  return (
    <div
      onClick={handleClick}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "relative rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-all duration-200",
        isDragging
          ? "border-gold-500 bg-gold-500/5 scale-[1.01]"
          : fileCount > 0
            ? "border-green-400 bg-green-50/50 dark:bg-green-950/30"
            : "border-gray-300 dark:border-gray-600 hover:border-navy-900/40 dark:hover:border-gray-500 hover:bg-gray-50/50 dark:hover:bg-muted/30"
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleInputChange}
        className="hidden"
      />

      {fileCount > 0 ? (
        <div className="space-y-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
            <IconComponent className="h-6 w-6 text-green-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-green-700">
              {fileCount === 1
                ? fileNames[0]
                : `${fileCount} files selected`}
            </p>
            {fileCount > 1 && (
              <p className="text-xs text-green-600 mt-0.5">
                {fileNames.slice(0, 3).join(", ")}
                {fileCount > 3 && ` + ${fileCount - 3} more`}
              </p>
            )}
          </div>
          <button
            onClick={clearFiles}
            className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-red-500 transition-colors mt-1"
          >
            <X className="h-3 w-3" />
            Remove
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <div
            className={cn(
              "mx-auto flex h-12 w-12 items-center justify-center rounded-full transition-colors",
              isDragging ? "bg-gold-500/10" : "bg-gray-100 dark:bg-muted"
            )}
          >
            <Upload
              className={cn(
                "h-6 w-6 transition-colors",
                isDragging ? "text-gold-600" : "text-gray-400 dark:text-gray-500"
              )}
            />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-600 dark:text-gray-300">{label}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              {hint || `Max ${maxSizeMB}MB per file`}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
