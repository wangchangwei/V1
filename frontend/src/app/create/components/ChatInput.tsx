import { FileText, Image, Paperclip, Send, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { ModelSelect } from "@/app/projects/components/ModelSelect";
import type { ModelInfo } from "@/lib/backend/api";

interface ChatInputProps {
  inputValue: string;
  setInputValue: (value: string) => void;
  onSendMessage: (attachments?: File[]) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  disabled?: boolean;
  pendingFiles?: File[];
  onRemovePendingFile?: (index: number) => void;
  models?: ModelInfo[];
  modelValue?: string;
  onModelChange?: (model: string) => void;
}

export const ChatInput = ({
  inputValue,
  setInputValue,
  onSendMessage,
  textareaRef,
  onKeyDown,
  disabled = false,
  pendingFiles = [],
  onRemovePendingFile,
  models = [],
  modelValue,
  onModelChange,
}: ChatInputProps) => {
  const [attachments, setAttachments] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allFiles = [...pendingFiles, ...attachments];

  const validateFiles = (files: File[]): File[] => {
    const maxFileSize = 5 * 1024 * 1024; // 5MB per file
    const maxTotalSize = 20 * 1024 * 1024; // 20MB total

    const currentTotalSize = allFiles.reduce((sum, file) => sum + file.size, 0);
    let newTotalSize = currentTotalSize;
    const validFiles: File[] = [];

    for (const file of files) {
      const isImage = file.type.startsWith("image/");
      const isDocument = [
        "application/pdf",
        "text/plain",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ].includes(file.type);

      if (!isImage && !isDocument) {
        toast.error(`${file.name} is not a supported file type`);
        continue;
      }

      if (file.size > maxFileSize) {
        toast.error(`${file.name} is too large (max 5MB per file)`);
        continue;
      }

      if (newTotalSize + file.size > maxTotalSize) {
        toast.error(
          `Cannot add ${file.name}: would exceed total size limit (max 20MB)`
        );
        continue;
      }

      newTotalSize += file.size;
      validFiles.push(file);
    }

    return validFiles;
  };

  const handleAttachClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles = validateFiles(files);

    if (validFiles.length > 0) {
      setAttachments((prev) => [...prev, ...validFiles]);
      if (validFiles.length !== files.length) {
        toast.success(`${validFiles.length} of ${files.length} files added`);
      }
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeAttachment = (index: number) => {
    const pendingCount = pendingFiles.length;
    if (index < pendingCount) {
      onRemovePendingFile?.(index);
    } else {
      const attachmentIndex = index - pendingCount;
      setAttachments((prev) => prev.filter((_, i) => i !== attachmentIndex));
    }
  };

  const handleSend = () => {
    onSendMessage(attachments.length > 0 ? attachments : undefined);
    setAttachments([]);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const getTotalSize = () => {
    const total = allFiles.reduce((sum, file) => sum + file.size, 0);
    return formatFileSize(total);
  };

  const getFileIcon = (file: File) => {
    if (file.type.startsWith("image/")) {
      return <Image className="w-4 h-4 text-emerald-400" />;
    }
    return <FileText className="w-4 h-4 text-blue-400" />;
  };

  return (
    <div className="p-4 space-y-3">
      {allFiles.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-medium text-[#666666] px-1">
            <span>Attached files ({allFiles.length})</span>
            <span className="text-[#888888]">Total: {getTotalSize()}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {allFiles.map((file, index) => (
              <div
                key={`${file.name}-${index}`}
                className="group flex items-center gap-2 bg-[#faf9f8] hover:bg-[#f1f0ef] rounded-lg px-3 py-2 text-sm border border-[#e5e5e5] hover:border-[#cccccc] transition-all duration-200 shadow-sm"
              >
                {getFileIcon(file)}
                <div className="flex flex-col min-w-0">
                  <span
                    className="text-[#1a1a1a] font-medium truncate max-w-32"
                    title={file.name}
                  >
                    {file.name}
                  </span>
                  <span className="text-xs text-[#888888]">
                    {formatFileSize(file.size)}
                  </span>
                </div>
                <button
                  onClick={() => removeAttachment(index)}
                  className="text-[#888888] hover:text-red-500 opacity-70 hover:opacity-100 transition-all duration-200 p-0.5 hover:bg-red-50 rounded"
                  title="Remove file"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 p-4 bg-white rounded-xl border border-[#e5e5e5] shadow-sm relative overflow-hidden">

        <div className="flex items-end gap-3 relative z-10">
          <div className="flex-1">
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="What do you want to build?"
              disabled={disabled}
              className="w-full bg-transparent text-[#1a1a1a] placeholder-[#888888] resize-none focus:outline-none py-2 px-0 min-h-[44px] max-h-[120px] text-sm leading-relaxed disabled:opacity-50"
              rows={1}
              style={{
                height: "auto",
                minHeight: "44px",
              }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = "auto";
                target.style.height = Math.min(target.scrollHeight, 120) + "px";
              }}
            />
          </div>

          <button
            type="button"
            onClick={handleSend}
            disabled={(!inputValue.trim() && allFiles.length === 0) || disabled}
            className="flex-shrink-0 p-2.5 bg-[#1a1a1a] text-white hover:bg-[#333333] disabled:bg-[#f1f0ef] disabled:text-[#888888] disabled:cursor-not-allowed rounded-lg transition-all shadow-sm"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center justify-between relative z-10">
          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf,.txt,.doc,.docx"
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              type="button"
              onClick={handleAttachClick}
              className="flex items-center gap-2 text-sm text-[#888888] hover:text-[#1a1a1a] hover:bg-[#faf9f8] px-3 py-1.5 rounded-md transition-all disabled:opacity-50 border border-transparent hover:border-[#e5e5e5]"
              disabled={disabled}
            >
              <Paperclip className="w-4 h-4" />
              <span>Attach</span>
            </button>
            {models.length > 0 && onModelChange && (
              <ModelSelect
                models={models}
                value={modelValue || ""}
                disabled={disabled}
                onChange={onModelChange}
              />
            )}
          </div>

          <div className="text-xs text-[#888888] text-right">
            <div>Drag & drop files anywhere</div>
            <div className="text-[#999999]">Max 5MB per file, 20MB total</div>
          </div>
        </div>
      </div>
    </div>
  );
};
