"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { HelpCircle } from "lucide-react";

interface ModelSelectorProps {
  provider: string;
  model: string;
  onProviderChange: (provider: string) => void;
  onModelChange: (model: string) => void;
}

const MODELS = {
  openai: [
    { value: "gpt-4o-mini", label: "GPT-4o Mini" },
    { value: "gpt-4o", label: "GPT-4o" },
    // GPT-5 시리즈 (최신)
    { value: "gpt-5-nano", label: "GPT-5 Nano" },
    { value: "gpt-5-mini", label: "GPT-5 Mini" },
    { value: "gpt-5.1", label: "GPT-5.1" },
    { value: "gpt-5", label: "GPT-5 (Legacy)" },
    // Reasoning 모델 (o1 시리즈)
    { value: "o1-mini", label: "O1 Mini" },
    // GPT-4 Turbo
    { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
  ],
  claude: [
    { value: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet" },
    { value: "claude-3-opus-20240229", label: "Claude 3 Opus" },
    { value: "claude-3-sonnet-20240229", label: "Claude 3 Sonnet" },
    { value: "claude-3-haiku-20240307", label: "Claude 3 Haiku" },
  ],
  custom: [{ value: "gpt-5.1", label: "Custom Model" }],
};

const PROVIDER_LINKS = {
  openai: "https://platform.openai.com/api-keys",
  claude: "https://console.anthropic.com/settings/keys",
  custom: "https://platform.openai.com/api-keys", // 기본값으로 OpenAI 링크
};

export function ModelSelector({
  provider,
  model,
  onProviderChange,
  onModelChange,
}: ModelSelectorProps) {
  const handleHelpClick = () => {
    const link =
      PROVIDER_LINKS[provider as keyof typeof PROVIDER_LINKS] ||
      PROVIDER_LINKS.openai;
    window.open(link, "_blank", "noopener,noreferrer");
  };

  const handleProviderChange = (newProvider: string) => {
    onProviderChange(newProvider);
    // Provider 변경 시 해당 provider의 첫 번째 모델 자동 선택
    const models = MODELS[newProvider as keyof typeof MODELS];
    if (models && models.length > 0) {
      onModelChange(models[0].value);
    }
  };

  return (
    <div className="flex gap-2 items-center">
      <Select value={provider} onValueChange={handleProviderChange}>
        <SelectTrigger className="w-[140px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="openai">OpenAI</SelectItem>
          <SelectItem value="claude">Claude</SelectItem>
          <SelectItem value="custom">Custom</SelectItem>
        </SelectContent>
      </Select>
      <Select value={model} onValueChange={onModelChange}>
        <SelectTrigger className="w-[180px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MODELS[provider as keyof typeof MODELS]?.map((m) => (
            <SelectItem key={m.value} value={m.value}>
              {m.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="ghost"
        size="icon"
        onClick={handleHelpClick}
        className="h-10 w-10"
        title={`${
          provider === "openai"
            ? "OpenAI"
            : provider === "claude"
            ? "Claude"
            : "Custom"
        } API 키 발급 사이트로 이동`}
      >
        <HelpCircle className="h-4 w-4" />
      </Button>
    </div>
  );
}
