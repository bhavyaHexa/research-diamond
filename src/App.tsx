import { Loader } from "./components/Loader";
import { PipelinePanel } from "./components/pipeline/PipelinePanel";
import { ViewerCanvas } from "./scene/ViewerCanvas";

export function App() {
  return (
    <div id="stage-div">
      <ViewerCanvas />
      <PipelinePanel />
      <Loader />
    </div>
  );
}
