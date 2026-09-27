import { useSyncExternalStore } from 'react';
import { DATA_VERSION } from './mock';

/** Re-renders the caller when fresh crawl data has been loaded. */
export function useDataVersion() {
   return useSyncExternalStore(DATA_VERSION.subscribe, DATA_VERSION.get, DATA_VERSION.get);
}
