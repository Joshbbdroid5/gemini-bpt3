## Selection page crash - working notes

Likely causes:
- ResizeObserver undefined
- react-window FixedSizeGrid ref/scroll usage during quick navigation
- socket event handlers firing during initial mount

Next code change will focus on guarding `ResizeObserver` usage.
