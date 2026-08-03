import {
  cloneElement,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type ReactElement,
  type ReactNode
} from "react";
import { FloatingPanel } from "./FloatingPanel";

interface HoverTooltipProps {
  children: ReactElement<{ "aria-describedby"?: string }>;
  className?: string;
  content: ReactNode;
  onlyWhenTruncated?: boolean;
  panelClassName?: string;
}

/** A themed text tooltip for concise, non-interactive supporting content. */
export function HoverTooltip({
  children,
  className = "",
  content,
  onlyWhenTruncated = false,
  panelClassName = ""
}: HoverTooltipProps) {
  const tooltipId = useId();
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isTruncated, setIsTruncated] = useState(!onlyWhenTruncated);
  const open = (isHovered || isFocused) && (!onlyWhenTruncated || isTruncated);
  const existingDescription = children.props["aria-describedby"];
  const describedBy = [existingDescription, open ? tooltipId : undefined]
    .filter(Boolean)
    .join(" ");

  useLayoutEffect(() => {
    if (!onlyWhenTruncated) {
      setIsTruncated(true);
      return;
    }

    const trigger = anchorRef.current?.firstElementChild;
    if (!(trigger instanceof HTMLElement)) {
      setIsTruncated(false);
      return;
    }

    const updateTruncation = () => {
      setIsTruncated(
        trigger.scrollWidth > trigger.clientWidth || trigger.scrollHeight > trigger.clientHeight
      );
    };

    updateTruncation();
    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateTruncation);
    resizeObserver?.observe(trigger);
    window.addEventListener("resize", updateTruncation);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateTruncation);
    };
  }, [children, onlyWhenTruncated]);

  function handleBlur(event: FocusEvent<HTMLSpanElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsFocused(false);
    }
  }

  return (
    <span
      ref={anchorRef}
      className={`ui-hover-tooltip ${className}`.trim()}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setIsFocused(true)}
      onBlur={handleBlur}
    >
      {cloneElement(children, { "aria-describedby": describedBy || undefined })}
      <FloatingPanel
        anchorRef={anchorRef}
        className={`ui-hover-tooltip__panel ${panelClassName}`.trim()}
        id={tooltipId}
        open={open}
        role="tooltip"
      >
        {content}
      </FloatingPanel>
    </span>
  );
}
