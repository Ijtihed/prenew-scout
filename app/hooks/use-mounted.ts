import { useEffect, useState } from 'react';

/** True after hydration; persisted client state must wait for it to avoid mismatches. */
export function useMounted() {
   const [mounted, setMounted] = useState(false);
   useEffect(() => {
      setMounted(true);
   }, []);
   return mounted;
}
