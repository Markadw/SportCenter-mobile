import { useRouter } from "expo-router";
import { ScreenState } from "../components/ScreenState";

export default function NotFoundScreen() {
  const router = useRouter();
  return <ScreenState title="No encontramos esta pantalla"
    message="El enlace puede ser incorrecto o haber cambiado. Puedes continuar en el catálogo."
    action="Ir al catálogo" onAction={() => router.replace("/catalog")} />;
}
