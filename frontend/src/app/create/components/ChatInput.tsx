import { FileText, Image, Paperclip, Send, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "react-hot-toast";

interface ChatInputProps {
  inputValue: string;
  setInputValue: (value: string) => void;
  onSendMessage: (attachments?: File[]) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  disabled?: boolean;
  pendingFiles?: File[];
  onRemovePendingFile?: (index: number) => void;
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
          <div className="flex items-center justify-between text-xs font-medium text-white/70 px-1">
            <span>Attached files ({allFiles.length})</span>
            <span className="text-white/50">Total: {getTotalSize()}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {allFiles.map((file, index) => (
              <div
                key={`${file.name}-${index}`}
                className="group flex items-center gap-2 bg-gray-700/40 hover:bg-gray-700/60 backdrop-blur-sm rounded-lg px-3 py-2 text-sm border border-gray-600/30 hover:border-gray-500/50 transition-all duration-200 shadow-sm"
              >
                {getFileIcon(file)}
                <div className="flex flex-col min-w-0">
                  <span
                    className="text-white font-medium truncate max-w-32"
                    title={file.name}
                  >
                    {file.name}
                  </span>
                  <span className="text-xs text-gray-400">
                    {formatFileSize(file.size)}
                  </span>
                </div>
                <button
                  onClick={() => removeAttachment(index)}
                  className="text-gray-400 hover:text-red-400 opacity-70 hover:opacity-100 transition-all duration-200 p-0.5 hover:bg-red-500/10 rounded"
                  title="Remove file"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 p-4 bg-gray-800/50 backdrop-blur-md rounded-xl border border-gray-700/40 shadow-sm relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-gray-700/5 via-transparent to-gray-600/5 rounded-xl" />

        <div className="flex items-end gap-3 relative z-10">
          <div className="flex-1">
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="What do you want to build?"
              disabled={disabled}
              className="w-full bg-transparent text-white placeholder-zinc-400 resize-none focus:outline-none py-2 px-0 min-h-[44px] max-h-[120px] text-sm leading-relaxed disabled:opacity-50"
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
            className="flex-shrink-0 p-2.5 bg-blue-600/90 hover:bg-blue-600 disabled:bg-zinc-700/50 disabled:cursor-not-allowed rounded-lg transition-all shadow-sm hover:shadow-blue-500/20 disabled:shadow-none backdrop-blur-sm"
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
              className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white hover:bg-gray-700/40 px-3 py-1.5 rounded-md transition-all disabled:opacity-50 backdrop-blur-sm border border-transparent hover:border-gray-600/30"
              disabled={disabled}
            >
              <Paperclip className="w-4 h-4" />
              <span>Attach</span>
            </button>
          </div>

          <div className="text-xs text-gray-500 text-right">
            <div>Drag & drop files anywhere</div>
            <div className="text-gray-600">Max 5MB per file, 20MB total</div>
          </div>
        </div>
      </div>
    </div>
  );
};
