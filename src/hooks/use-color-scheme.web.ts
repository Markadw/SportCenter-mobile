import { useSyncExternalStore } from "react";
import { useColorScheme as useRNColorScheme } from "react-native";

/**
 * To support static rendering, this value needs to be re-calculated on the client side for web
 */

const subscribe = () => () => {};

export function useColorScheme() {
  const isClient = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  const colorScheme = useRNColorScheme();

  return isClient ? colorScheme : "light";
  // const [hasHydrated, setHasHydrated] = useState(false);

  // useEffect(() => {
  //   setHasHydrated(true);
  // }, []);

  // const colorScheme = useRNColorScheme();

  // if (hasHydrated) {
  //   return colorScheme;
  // }

  // return 'light';
}
