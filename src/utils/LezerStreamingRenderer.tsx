/**
 * Streaming wrapper for Lezer markdown renderer
 * 
 * Provides streaming character-by-character reveal functionality
 * while using Lezer for the actual markdown parsing.
 */

import React from 'react';
import { Text } from 'react-native';
import { LezerMarkdownRenderer, MarkdownStyleConfig } from './LezerMarkdownRenderer';

interface StreamingTextProps {
  content: string;
  isStreaming: boolean;
  style: any;
  isAssistant?: boolean;
  messageId?: string;
}

export const LezerStreamingText: React.FC<StreamingTextProps> = ({ 
  content, 
  isStreaming, 
  style, 
  isAssistant, 
  messageId 
}) => {
  const [revealedLength, setRevealedLength] = React.useState(0);
  const [hasStartedRevealing, setHasStartedRevealing] = React.useState(false);
  const [targetEndTime, setTargetEndTime] = React.useState<number | null>(null);
  const [wasStreaming, setWasStreaming] = React.useState(false);

  // Create Lezer renderer
  const styleConfig: MarkdownStyleConfig = React.useMemo(() => ({
    fontSize: (style as any)?.fontSize ?? 16,
    lineHeight: (style as any)?.lineHeight ?? Math.round(((style as any)?.fontSize ?? 16) * 1.4),
    color: (style as any)?.color,
    backgroundColor: (style as any)?.backgroundColor,
    fontFamily: (style as any)?.fontFamily,
  }), [style]);

  const renderer = React.useMemo(() => new LezerMarkdownRenderer(styleConfig), [styleConfig]);

  // Reset when message changes
  const lastMessageIdRef = React.useRef<string | undefined>(undefined);
  React.useEffect(() => {
    if (isAssistant && messageId && messageId !== lastMessageIdRef.current) {
      setRevealedLength(0);
      setHasStartedRevealing(false);
      setTargetEndTime(null);
      setWasStreaming(false);
      lastMessageIdRef.current = messageId;
    }
  }, [messageId, isAssistant]);

  // Handle streaming state changes
  React.useEffect(() => {
    if (wasStreaming && !isStreaming) {
      const endTime = performance.now() + 10000; // 10 seconds from now
      setTargetEndTime(endTime);
    }
    setWasStreaming(isStreaming);
  }, [isStreaming, wasStreaming]);

  // Character reveal animation
  React.useEffect(() => {
    const contentLength = [...content].length; // Unicode character count

    if (contentLength > 0 && (isStreaming || revealedLength < contentLength) && contentLength > revealedLength) {
      if (isStreaming && !hasStartedRevealing && contentLength > 0) {
        setHasStartedRevealing(true);
        setRevealedLength(0);
        setTargetEndTime(null);
      }

      let lastUpdateTime = performance.now();
      let animationId: number;

      const updateReveal = () => {
        const now = performance.now();
        const deltaTime = now - lastUpdateTime;

        if (isStreaming) {
          // During streaming: reveal 1 character every 2ms
          if (deltaTime >= 2) {
            setRevealedLength(prev => Math.min(prev + 1, contentLength));
            lastUpdateTime = now;
          }
        } else if (targetEndTime) {
          // After streaming: maintain or increase speed
          const remainingTime = Math.max(1, targetEndTime - now);
          const remainingChars = contentLength - revealedLength;

          if (remainingChars > 0) {
            if (deltaTime >= 2) {
              const framesRemaining = Math.max(1, Math.ceil(remainingTime / 16));
              const minCharsPerFrame = Math.ceil(remainingChars / framesRemaining);
              const streamingSpeedChars = 1;
              const charsToReveal = Math.max(streamingSpeedChars, minCharsPerFrame);

              setRevealedLength(prev => Math.min(prev + charsToReveal, contentLength));
              lastUpdateTime = now;
            }
          }
        }

        const shouldContinue = revealedLength < contentLength && (isStreaming || targetEndTime);
        if (shouldContinue) {
          animationId = requestAnimationFrame(updateReveal);
        } else {
          if (!isStreaming && revealedLength >= contentLength) {
            setTargetEndTime(null);
            setHasStartedRevealing(false);
          }
        }
      };

      animationId = requestAnimationFrame(updateReveal);

      return () => {
        if (animationId) {
          cancelAnimationFrame(animationId);
        }
      };
    }
  }, [content, isStreaming, revealedLength, hasStartedRevealing, targetEndTime]);

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      if (hasStartedRevealing) {
        setHasStartedRevealing(false);
        setTargetEndTime(null);
      }
    };
  }, []);

  // For assistant messages, use Lezer markdown rendering
  if (isAssistant) {
    if (!hasStartedRevealing) {
      // Before streaming starts, show full content
      const rendered = renderer.render(content, style);
      return <>{Array.isArray(rendered) ? rendered.map((item, i) => React.cloneElement(item as React.ReactElement, { key: `static-${i}` })) : rendered}</>;
    } else if (revealedLength >= [...content].length && !isStreaming && wasStreaming) {
      // Streaming complete - show full content
      const rendered = renderer.render(content, style);
      return <>{Array.isArray(rendered) ? rendered.map((item, i) => React.cloneElement(item as React.ReactElement, { key: `complete-${i}` })) : rendered}</>;
    } else {
      // During streaming - show partial content
      const visibleChars = [...content].slice(0, revealedLength);
      const visibleContent = visibleChars.join('');
      const rendered = renderer.render(visibleContent, style);
      return <>{Array.isArray(rendered) ? rendered.map((item, i) => React.cloneElement(item as React.ReactElement, { key: `streaming-${i}` })) : rendered}</>;
    }
  }

  // For user messages - plain text with character reveal
  const visibleContent = !hasStartedRevealing ? content : content.slice(0, revealedLength);
  return (
    <Text style={style}>
      {visibleContent}
    </Text>
  );
};
