# Key Algorithms & Implementation Details

## 1. Real-time Price Aggregation (`useClobMarketPrices`)

### Problem
Polymarket's CLOB (Central Limit Order Book) WebSocket emits frequent updates for multiple assets. Directly rendering every update would cause excessive re-renders and performance degradation in React.

### Solution
We implement a **Debounced Snapshot Strategy**:
1.  **WebSocket Connection**: Manages a robust WebSocket connection with exponential backoff for reconnection (1s -> 2s -> 4s... -> 30s).
2.  **Ref-based Accumulation**: Incoming messages (`book`, `price_change`, etc.) update a mutable `useRef` dictionary (`priceByAssetIdRef`) instantly without triggering re-renders.
3.  **Throttled Flush**: A `scheduleFlush` function debounces updates. It sets a timeout (e.g., 200ms) to trigger a React state update (`setVersion`).
4.  **Snapshot Synchronization**: When the state updates, a `useEffect` captures a shallow copy of the `useRef` data into React state (`pricesSnapshot`), ensuring the UI renders a consistent view of the latest prices.

### Code Reference
- [useClobMarketPrices.ts](src/hooks/useClobMarketPrices.ts)

## 2. Table Data Pipeline (`useTableData`)

### Problem
Data tables need to support searching, sorting, and pagination simultaneously while maintaining high performance for large datasets.

### Solution
The `useTableData` hook implements a memoized pipeline:
1.  **Input**: Raw data array `T[]`.
2.  **Sort (Step 1)**: If a `sortFn` is provided, create a shallow copy and sort it.
3.  **Filter (Step 2)**: Apply `filterFn` based on the current `query` string.
4.  **Pagination (Step 3)**: Slice the processed array based on `visiblePages * pageSize` to determine `visibleData`.
5.  **Optimization**: All steps are wrapped in `useMemo` to prevent recalculation unless dependencies (data, query, sort) change.

### Code Reference
- [useTableData.ts](src/hooks/useTableData.ts)

## 3. Timestamp Discovery (`findLatestTimestamp`)

### Problem
Different data entities (Trades, Activities) store timestamps in varying structures, but we need a generic way to find the "latest update time" for UI sync indicators.

### Solution
A generic utility function `findLatestTimestamp<T>`:
1.  Accepts an array of any type `T` that extends `{ timestamp: number }`.
2.  Iterates through the array once (O(n)).
3.  Validates each timestamp (checks `Number.isFinite`).
4.  Returns the maximum value found.
This simple utility eliminates duplicated `reduce` or `Math.max` logic across components.

### Code Reference
- [analytics.ts](src/lib/analytics.ts)

## 4. Copy Trade Simulation Engine

### Problem
Simulating historical copy trading requires accurate PnL calculation considering partial fills and budget constraints.

### Algorithm
1.  **Time Alignment**: Filter trades within the user-specified time window.
2.  **Sequential Processing**: Iterate trades chronologically.
3.  **Position Tracking**: Maintain a running tally of positions (average entry price, size).
4.  **PnL Calculation**:
    - For `BUY`: Decrease cash, increase position size.
    - For `SELL`: Increase cash, decrease position size, realize PnL based on difference between sell price and average entry price.
5.  **Constraints**: Skip trades if simulated cash is insufficient (preventing negative balance).

### Code Reference
- [copyTradeSim.ts](src/lib/copyTradeSim.ts)
