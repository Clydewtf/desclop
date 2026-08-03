import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
  type RefObject
} from "react";

interface FloatingPanelProps extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  anchorRef: RefObject<HTMLElement | null>;
  children: ReactNode;
  open: boolean;
}

/** A viewport-clamped surface positioned below an anchored UI control. */
export function FloatingPanel({
  anchorRef,
  children,
  className = "",
  open,
  style,
  ...props
}: FloatingPanelProps) {
  const panelRef = useRef<HTMLSpanElement>(null);
  const [positionStyle, setPositionStyle] = useState<CSSProperties>();
  const classes = ["ui-floating-panel", className].filter(Boolean).join(" ");

  useLayoutEffect(() => {
    if (!open) {
      setPositionStyle(undefined);
      return;
    }

    const updatePosition = () => {
      const anchor = anchorRef.current;
      const panel = panelRef.current;

      if (!anchor || !panel) {
        return;
      }

      const viewportMargin = 8;
      const verticalGap = 6;
      const anchorRect = anchor.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      const maxLeft = Math.max(viewportMargin, window.innerWidth - panelRect.width - viewportMargin);
      const maxTop = Math.max(viewportMargin, window.innerHeight - panelRect.height - viewportMargin);

      setPositionStyle({
        position: "fixed",
        left: Math.min(Math.max(viewportMargin, anchorRect.left), maxLeft),
        top: Math.min(Math.max(viewportMargin, anchorRect.bottom + verticalGap), maxTop)
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [anchorRef, open]);

  return (
    <span
      {...props}
      ref={panelRef}
      className={classes}
      style={{ ...style, ...positionStyle }}
      hidden={!open}
    >
      {children}
    </span>
  );
}
