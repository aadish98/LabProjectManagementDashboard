import { AppRouter } from "./app/AppRouter";
import { useAppController } from "./app/useAppController";
import { useAppUpdates } from "./app/useAppUpdates";

export default function App() {
  const { banner, dialog } = useAppUpdates();

  return (
    <>
      {banner}
      <AppRouter app={useAppController()} />
      {dialog}
    </>
  );
}
