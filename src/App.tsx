import { Loader } from "./components/Loader";
import { ViewerCanvas } from "./scene/ViewerCanvas";

export function App() {
  return (
    <div id="stage-div">
      <ViewerCanvas />
      <Loader />
    </div>
  );
}
