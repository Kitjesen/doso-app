package expo.modules.dosopointcloud

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class PointCloudModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("DosoPointCloud")
    Constant("supported") { NativeCloud.available() }
    View(PointCloudView::class) {
      Events("onStatus")
      Prop("endpoint") { view: PointCloudView, value: String -> view.endpoint = value }
      Prop("kind") { view: PointCloudView, value: Int -> view.kind = value }
      Prop("active") { view: PointCloudView, value: Boolean -> view.active = value }
      OnViewDidUpdateProps { view: PointCloudView -> view.applyProps() }
      OnViewDestroys { view: PointCloudView -> view.dispose() }
    }
    OnActivityEntersBackground { PointCloudView.setForeground(false) }
    OnActivityEntersForeground { PointCloudView.setForeground(true) }
    OnDestroy { PointCloudView.destroyAll() }
  }
}
