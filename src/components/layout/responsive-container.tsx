import { ReactNode, CSSProperties } from "react";

interface ResponsiveContainerProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

/**
 * Responsive container component that:
 * - Centers content with max-width 1400px on large screens
 * - Adds responsive padding
 * - Supports minimum width of 375px
 * - Custom breakpoint at 1300px for large padding
 */
export default function ResponsiveContainer({ children, className = "", style }: ResponsiveContainerProps) {
  return (
    <>
      <style>{`
        .responsive-container-custom {
          width: 100%;
          max-width: 1400px;
          margin-left: auto;
          margin-right: auto;
          padding-left: 1rem;
          padding-right: 1rem;
        }
        @media (min-width: 768px) {
          .responsive-container-custom {
            padding-left: 1.5rem;
            padding-right: 1.5rem;
          }
        }
        @media (min-width: 1300px) {
          .responsive-container-custom {
            padding-left: 2rem;
            padding-right: 2rem;
          }
        }
      `}</style>
      <div className={`responsive-container-custom ${className}`} style={style}>
        {children}
      </div>
    </>
  );
}
