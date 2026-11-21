# Auth 初始监听读取的排他修复门禁

## 2026-10-17 本轮补充：initialized public SDK新保存链通过，不关闭完整启动门禁

新增正常7项完整new-save控制：替换/首次头像/移除/文字、cleanup403后恢复、无法验证RPC回包、已发RPC超时后合成server迟到commit再恢复。production save/journal/coordinator，installed public SDK，native存储/UUID/clock/rawHTTP合成，不替换SDK方法；不同object/operation UUID、请求参数与顺序、prepared→uncertain→committed→清理后读回/最终identity→clear、只删旧对象且不重放当前新表单均验证。Auth I/O为session-read owned，Data/Storage锁外。正常startup initialize/INITIAL_SESSION在观察前完成，故不代表constructor/INITIAL、mounted Provider联合或跨runtime通过。

最终11文件**257/257 actualexit0/86,066ms**（含新7），无fail/skip/cancel/todo/timeout，sourcesStable；独立冻结SHA审查APPROVE_SCOPE_ONLY、blocker0/CLEAR。初始7/7精确测试快照保留，最终test为53882425…/17,540B。产品service仍246d0182…/21,802B，旧tests/lock/App/Provider不变；301App输入仅package测试登记变、300保持，21protected/10SDK/145tracked保持。本轮无产品TS改动，noEmit0次，不挪用前轮类型结果。旧f313 QA不含近期修复，无build/install或native/cloud通过。

只闭合initialized SDK+合成HTTP下的新成功/恢复客户端合同，不能当作live SQL/RLS/对象存在检查/Storage或Android/网络验收。upload回包真实Id/Key用于夹具，但产品仅检查error，不声称验证返回path。发布NO-GO/正式0/20；下一项回到后端待部署清单和既有批准范围核对，未获明确批准不执行生产SQL/RLS/权限动作，未变前置不重复换网/环境探测。证据：`artifacts/release-readiness/20261017-profile-save-workflow/integration.json`、NOTES/review/scope与最终日志；历史不改。

## 2026-10-17 本轮补充：cleanup retire/delete/readback已owned，原3s预算与journal契约保留

在4项旧诊断RED上按正常TDD三竖切推进：retire busy RED→GREEN；late DELETE Auth超时RED→GREEN（actualSDK仍retain/owned，lateDELETE1→0）；readback busy RED→GREEN，busy DELETE另纳正常控制。private helper仅新增absoluteDeadlineMs默认20s；cleanup准备/删除/原返回5xx retry传同一原3s截止线，不重置，finish前identity完成后才创建读回独立原3s。Auth getSession retain并限时，token后释放owner再public SDK/rawfetch/request-local headers构造目标HTTP，网络锁外，已发网络不取消/撤销。原fences/journal/proof/error/retry结构不改，cleanup unusedlocalgetter移除。

最终关联**250/250 actualexit0/106,546ms（含新34）**、noEmit exit0/76,872ms、ASTscope exit0/5,265ms，sourcesStable、无skip/cancel/todo/timeout。新34验证四旧缺口、完整publicSDK旧债务恢复、迟写owned/不迟发、HTTP等待可另读Auth、1200+1800预算、retire3s耗尽不DELETE、一次503重验且二次仅剩1500ms、remove2800ms后readback独立3s、late网络/读回后丢session不clear。foreign proof/空DELETEack新34明确覆盖，其他malformed proof由不改旧71业务承担，不能夸大新套件。独立冻结SHA实现/证据审查APPROVE_SCOPE_ONLY、blocker0/CLEAR；旧71+8及23read/24write测试facade字节保持。

service246d0182…/21,802B、newtest98404e92…/28,411B；301App输入2变/299不变，19protected/10SDK/145tracked保持，package仅正常test入口、lock/App/Provider不改。旧f313包不含近期修复，无新构建安装/云端native通过/真实对象凭据/云权限动作/环境网络Logo重试。仅本地cleanup闭合，不关闭完整constructor/INITIAL/跨runtime/mountedProvider联合、新保存upload成功全链或live后端/Storage/RLS/Android/普通网络。下一先新保存完整SDK成功链，不复用旧债务恢复冒充；NO-GO/正式0/20、既有部署和发布前置保留。证据：`artifacts/release-readiness/20261017-profile-cleanup-transport/integration.json`、NOTES/review/scope、原始RED/GREEN和最终日志。

## 2026-10-17 本轮补充：cleanup三处隐式Auth及caller超时后的迟到DELETE已有真实SDK RED

仅诊断artifact与现有文档更新，产品/正常tests/package/lock/App/Provider不改。production save/journal/coordinator + public SDK，seed通过public beginPrepared→arm→mark(committed)，初始化/INITIAL在观测前完成，平台持久化/UUID/时钟/HTTP合成。retire/delete/readback分别在真实第3/4/5次getUser owner释放时注foreign+expired；三个入口均foreign refresh1/Auth写1/目标HTTP1且journal committed保留。第四RED暂停实际SDK refresh的storage set，原3s caller返回pending且owner不busy；仅释放set并等待public TOKEN_REFRESHED及下一macrotask，SDK实际迟到合成DELETE1、readback0、日志未清，不是测试主动派发或真实对象删除。

最终**12=8 controls符合预期+4 safety RED，actualexit1/13,576ms**、sourceStable、无skip/cancel/todo/timeout，独立APPROVE_SCOPE_ONLY仅批准诊断。旧11矩阵及其29ca827…snapshot保留；当前fixture c8389a7f…/19,919B，不能混淆SHA。3个no-foreign fresh控制是同一完整恢复条件重复，不是3种独立phase覆盖。未重跑216/typecheck或将历史通过挪用为本轮通过。

remove原单一3s只覆盖identity/retire/identity/DELETE/允许returned5xx retry，retire耗3001ms后delete0；finish后身份/读回各为原独立3s，remove耗2800ms仍readback新3s，迟到读回不clear。下一修复必须用同一absolute3s约束actualgetSession retain与之后request construction，Auth caller超时不迟发，网络在owner外；readback保持自己原3s及fences/proof/journal契约。禁止盲套默认20s、每步重置预算、wholeHTTP大锁或用outertimeout冒充取消。

service7be750ad…/21,399B未改，301App输入0变，17protected/10SDK/145tracked保留，旧f313包不含近期修复。新云端/native/构建通过0，无真实对象/凭据/云权限动作或环境网络Logo重试。诊断子步完成，4个产品RED未修；NO-GO/正式0/20。完整constructor/INITIAL、跨runtime、live后端Storage/RLS/Android/普通网络及upload成功全链仍开放。证据：`artifacts/release-readiness/20261017-profile-cleanup-auth-boundary/integration.json`、NOTES/review/所有原始日志。

## 2026-10-17 本轮补充：profile RPC/upload20s transport本地闭合，3s cleanup仍开放

production save/journal/coordinator+installed public SDK先独立复现RPC/upload各1/0/1 RED，foreign owner仍active时refresh1/会话写1/POST1；最小接入既有helper后admission2/2。helper只改中性名称，body原样；session-read内retain actualgetSession、Busy先于getter、Auth caller超时不迟发但SDK未settle仍保守持owner，token后释放，再public PostgREST/Storage+rawfetch/request-local headers构造原20s写。Auth与该请求共享20s，不是whole-save时限，已发HTTP不假取消。immutable candidate path来自同一次UUID并同时赋原cleanup holder，begin/upload同对象；多次identity/journal/error/result/3s retire/delete/readback均保留。

最终verified证据**216/216 actualexit0/66,792ms（含新24）**、noEmit exit0/41,865ms、ASTscope exit0/2,164ms，稳定输入，无skip/cancel/todo/timeout；独立APPROVE_SCOPE_ONLY、blocker0。真实SDK迟写retain、timeout latePOST0、7s+13s、网络锁外、缺/换会话/原错误/503无重放，以及头像更换和移除arm后Busy/timeout保留uncertain均验。原typecheck TS2345 exit2、之后旧static anchor失配215/216 exit1原样保留；70business+8identity正文不变，唯一旧guard同步新constanchor并加强入口存在断言，原身份顺序/数据库授权断言不删。外部RPCfacade不冒充真实transport。

service7be750ad…/21,399B，write test36ba9c84…；301App输入2变/299不变、16protected/10SDK/145tracked/lock/App/Provider/read suite保持，旧f313包不含修复。仅两write本地完成，**3s清理隐式Auth仍未修复**；新publicSDK upload正常控制以受控403截止，未关闭成功upload→RPC→cleanup全链或完整constructor/INITIAL/跨runtime/真实云RLS/Android普通网络门禁。无构建安装/云权限动作/真实凭据/环境网络Logo重试，NO-GO/正式0/20。下一先受控RED和3s预算审查，不盲用20shelper。证据：`artifacts/release-readiness/20261017-profile-write-transport/integration.json`、NOTES/review/scope-complete、GUARD_COMPATIBILITY和原始日志。

## 2026-10-17 本轮补充：profile两条read transport已owned，网络锁外且Auth超时不迟发

正常实际SDK先得admission2/0/2 RED actualexit1，再最小接入profile首SELECT/signedURL。新private helper在session-read内withTimeout等待lease.retain(actualgetSession)，busy先于getter/getSession，缺session/user变化拒绝；超时不续建Data但真实SDK未结不释放。原每次read20s先定absolute deadline，Auth结束releaseowner后检查余量，再公共PostgREST/StorageClient+rawfetch/request-local bearer构造，Data网络不占Auth。非whole-save锁/第二Auth/Realtime/token cell或取消/撤销；3scleanup、identity/journal/RPC/upload/delete/App/Provider未改。

专项23/23包含在8文件192/192中，actualexit0/101,849ms；noEmit exit0/81,839ms、ASTscope exit0/4,762ms，最终哈希稳定无skip/cancel/todo/timeout。真实迟写retain、Auth超时lateData0、7sAuth+13sData预算、pendingData允许其他真实Auth、busy不排队、缺/换session、GET503本次bearer重试0额外Auth读、Storage POST错误/不重试均验。独立APPROVE_SCOPE_ONLY；telemetry归因header与原共享client有非阻断差异，已发rawfetch不取消。旧71+8正文不改，host仅外部桥+真实getSession转发/publicINITIALsetup，最初oldKey=null发生在产品调用前，不作产品RED。Storage直接pin已安装2.112.3/rootlockmetadata，无安装升级。

service e6604e40…/21,091字节、newtest7c31271e…；301App输入3项service/package/lock变，298不变，14protected/10SDK/145tracked保留。两条读取本地闭合，不外推完整profile/其他RPC/上传/清理、constructor/INITIAL、跨runtime、native/cloud/RLS/network。NO-GO/正式0/20、旧f313包不含修复；无新云端/原生/构建/环境网络Logo重试。下一先复现剩余write/cleanup，保护journal与3sdeadline，不能盲套20shelper。证据：`artifacts/release-readiness/20261017-profile-read-transport/integration.json`、NOTES/scope/review和原始日志。

## 2026-10-17 本轮补充：profile SELECT/Storage sign隐式getSession已有实际SDK RED

仅诊断artifact，所有301项App输入与产品/正常测试/package/lock不变。真实production save/journal/coordinator+installed public SDK2.112.3，显式身份owner结束后public observer取得foreign并注入expired合成session；后续profiles SELECT在foreign active时session读3/refresh1/write1/HTTP1，受控403而非BusyError。production resolveProfileAvatarUrl直接Storage sign同样foreign refresh1/write1/signPOST1并fulfilled。最终6项矩阵4控制符合预期+2安全断言RED，actualexit1/12,803ms、稳定执行哈希，无skip/cancel/todo/timeout；不是6pass、真实越权/自然发生率或网络根因。

publicSDK initialize/INITIAL/freshgetSession观测前完成，不关闭完整startup；native存储/UUID和HTTP合成，没有内部服务mock/SDK方法替换/私有字段。初始CJS绑定保留，最终补实际ESM及Auth实现，fixture20ccd4ea…/12,942字节，service仍05b63c27…、App054c4ae9…。下一候选应只协调实际getSession+retain+caller deadline，Auth晚settle不能在caller超时后新发Data；DataHTTP/Storage/body等待不得占Auth。whole-save锁或外套timeout的device helper不是合格已证修复，具体待新RED/GREEN；无产品接线或新依赖。

独立只读APPROVE_SCOPE_ONLY仅诊断证据。矩阵hash限相关执行输入，全部301及前序绑定另做端点复核，不证明全仓库执行期不可变。诊断子步完成，产品修复及完整INITIAL/constructor仍开放。NO-GO/正式0/20、旧f313包身份不变；无新常规回归/typecheck或原生云端通过、无项目云查询写入/权限部署/重复环境网络Logo探测。证据：`artifacts/release-readiness/20261017-profile-data-auth-boundary/integration.json`、NOTES、DECISION、review及原始日志。

## 2026-10-17 本轮补充：settings迟到UI隔离闭合，不等于取消服务器请求

App settings callback新增稳定user/sessionId+deviceId/owner context object、render捕获及entry/current ticket/mounted守卫；上下文替换和根App卸载退休旧publication，A→B→A旧闭包不能发新请求，旧finally不能清新ticket。同session JWT/prepared-key rotation允许合法save，duplicate不排队。只涉及设置UI；Data/Auth/Provider/退出意图/bootstrap/bind/unbind未改，已开始请求仍可能完成，非取消/撤销/后端权限或原子切号。

有效stale-success RED1/0/1 actualexit1，独立审查补出old-closure ABA RED1/0/1 actualexit1后修正。最终publication15项包含在关联115/115内，actualexit0/102,713ms；当前noEmit exit0/75,699ms、guard exit0/1,463ms，输入稳定且无skip/cancel/todo/timeout。旧14/114及相应旧type/guard绑定修正前源码，保留不作最终证据。App054c4ae9…、testf1d5dbba…；实际App源码提取+production Data/coordinator/publicSDK，storage/HTTP和已提交React/Auth输入受控，非完整mounted Provider/native/live后端。

301App输入仅App/package变化，299相同；14来源和145tracked状态保持，旧f313包不含修复。NO-GO/正式0/20，完整constructor/INITIAL、其余Data/Storage隐式Auth、真实RLS/Android/network及新QA仍开放；无新云端/构建安装/重复环境网络Logo探测。证据：`artifacts/release-readiness/20261017-device-settings-publication/integration.json`、NOTES及scope/review/原始日志。

## 2026-10-17 本轮补充：device Data query seam已接产品，不关闭INITIAL/注销取消门禁

在上一轮隐式Auth RED上新增实际repository/publicSDK正常测试：explicit身份owner释放时foreign取得排他，旧码仍implicit refresh1/write1/DataHTTP1，admission1/0/1 actualexit1。现deviceDataQuery在任何query构造前session-read owner内await原共享getSession，error原抛/缺会话或userid变化拒绝；令牌取得后释放owner，用公开PostgrestClient的request-local headers/apikey/schema/rawfetch构造原list/settings query，Data error不包装。无第二Auth/Realtime、global凭据cell、私有SDK或全Data网络锁，busy发生在SDKbuilder前，不会重试变成稍后执行；默认GET网络retry保留，不新读Auth，PATCH仍默认无retry。explicitgetUser/claim/unbind及App/Provider/client/coordinator保持。

最终关联85/85含新11+旧12device专项，noEmit actualexit0/37,004ms、源码护栏exit0；所有运行输入稳定，无skip/cancel/todo/timeout。真实延迟refresh写回owned、DataHTTPpending允许其他真实Auth读、busy/缺session/换号/错误/SDKquery/503retry均验证。独立APPROVE_SCOPE_ONLY，LOW遥测header X-Client-Info差异记录；没有专门network-throw retry或device+mounted Provider联合场景，shared Provider/coordinator回归包含其中。直接依赖pin已安装PostgREST2.112.3，lock仅根条目增加、未安装升级；模块6deecce1…、repositorya7cfa988…、newtestd2b13e0a…，301App输入中297原项相同，旧f313包不含修复。

**仅设备Data令牌读取本地闭合，不是整个Auth生命周期安全承诺。** 完整constructor/INITIAL、其他Data调用、跨runtime、真实后端/RLS/Android/网络仍开放。会话userid只做一致性关联，已开始请求/retry持有request bearer，不会随退出自动取消/撤销，也未解决迟到App UI publication。Data可挂起但Authowner空闲；永久挂起Auth存储不假释放。下一项按实际App退出/切号验证设备迟到结果隔离；NO-GO/正式0/20不变，无新构建安装/云端/环境网络Logo探测。证据：`artifacts/release-readiness/20261017-device-data-query-seam/integration.json`、NOTES、scope/review和原始日志；旧证据不可变。

## 2026-10-17 本轮补充：设备Data隐式getSession绕过排他已有真实SDK行为RED

新夹具用production repository/coordinator/authRequestFetch和真实installed createClient/Auth/PostgREST，只合成storage/HTTP。fresh public initialize→INITIAL→getSession setup后开始观测；显式身份完成后第二getter注入expired synthetic session并取得foreign owner，list GET和settings PATCH都在foreign仍busy时refresh1/write1/DataHTTP1。干净单项1/0/1 exit1，最终4项矩阵2控制符合预期、2安全断言失败、实际exit1/12,722ms，稳定源码且无skip/cancel/todo/timeout。独立APPROVE_SCOPE_ONLY仅批准表征，不是修复。草稿constructor recorder异常保留但不作干净RED；最终无该异常。

Auth读写缺口确证，不把DataHTTP本身或合成干预说成真实越权。手写Authorization仍无条件走SDK getSession，不可作修复；整个未设deadline devices网络进owner有可用性风险，不采用。当前共享client加accessToken会禁用Auth；新Data-only Supabase client会构造期提前调provider，GET还可能重试/包装其错误，须单独验证，不能挪用历史敏感token-cell实验的8项为产品批准。下一项优先收敛公开、无Auth构造副作用的Data seam：实际getSession owner内，HTTP/body锁外，busy不排队重放，身份/错误与现有caller兼容。产品未改、300项App输入0变化，fixture10cba39d…非交付源码，旧f313包不含近期修复。

**隐式Data修复及完整INITIAL/constructor均未完成；NO-GO/正式0/20不变。** 不外推完整客户端/跨runtime/全部Data API、真实后端/RLS/Android或普通网络根因。本轮无新常规suite/typecheck或原生云端通过，无生产权限/环境/网络/Logo重试。证据：`artifacts/release-readiness/20261017-device-data-auth-boundary/integration.json`及验收、DECISION、NOTES、review和原始日志；旧证据不可变。

## 2026-10-17 本轮补充：device显式getUser已协调，后续Data隐式会话入口仍开放

有效旧码RED：真实production repository/coordinator+installed public AuthClient、合成storage/HTTP/Data，外部owner仍busy时list fulfilled，getter2/refresh1/会话写1/Data query1，actual1/0/1 exit1。现仅将共享requireUserId的getter/getUser包进runAuthSessionOperation(kind=session-read)，原Promise真正settle后释放。无caller timeout，因此不用另加retain；无whole-flow owner/retry，原list/settings过滤/错误和claim/unbind保留。实际App调用点没有外层owner，不形成当前嵌套锁。

关联74/74包含12项新设备SDK测试、既有设备页/Provider/coordinator回归；静态护栏与noEmit实际exit0（62,045ms），独立APPROVE_SCOPE_ONLY。SDK延迟refresh写回/userGET全程owned，busy前置getter/Auth/Data0，原SDK/Data错误身份及query参数保持。首轮3个VM prototype夹具断言失败不计产品RED，最终日志包含全部修正控制。设备服务11bb33a9…、test2407853d…；300项App输入仅服务/package2项变化，旧f313包不含修复，无新原生或云端验收。

**该helper释放后，真实PostgREST的authenticated fetch仍会经_getSessionToken→auth.getSession读/刷新会话。** 已有独立只读源码定位，尚未行为复现；本轮Data边界为合成，不能宣称覆盖此隐式入口或原子身份查询。下一项以实际public createClient+合成global.fetch/storage观察两个入口，不依据源码观察直接扩大锁。完整constructor/INITIAL、跨runtime及挂起SDK仍开放，NO-GO/正式0/20不变；不重试未变化网络/环境/Logo/构建阻断。证据：`artifacts/release-readiness/20261017-device-identity-ownership/integration.json`及CALLER_AUDIT、NOTES、scope/review、原始日志。

## 2026-10-17 本轮补充：profile显式getUser归属已修，Data隐式入口未覆盖

production save/journal/coordinator+真实SDK2.112.3的合成RED：外部owner busy时save继续refresh/userGET和模拟profile RPC；caller timeout后SDK仍pending而coordinator不busy。两项各actual1/0/1、exit1。现assertExpectedUser每次runAuthSessionOperation(kind=session-read)，先lease.retain原始getUser，再withTimeout；getter在owner内，save/cleanup首个Data client getter延后至初始身份检查之后。原fences/身份错误/journal/清理安全结构保留，无whole-save外层owner，因此连续已settle的helper不嵌套。

最终关联126/126包含8新SDK/Provider案例和96资料/journal子集，TypeScript实际exit0/34,036ms，独立APPROVE_SCOPE_ONLY。实际延迟refresh写回、user读取、caller timeout后late SDK无保存续跑、错误原对象及账户不匹配均验证；同SDK/coordinator生产Provider健康read保持prepared key，真实TOKEN_REFRESHED仍使其失效再准备。正常harness真实coordinator、单项旧retry预期加强到SDK settle后才允许取消prepared且不重放，其他正文未改。两次宿主Buffer/Response夹具失败不算产品RED；最终套件覆盖修正。

服务05b63c27…，新test53725434…，package只追加profile测试；300项App输入其余298不变，旧f313包不含近期修复。**本补充不关闭完整INITIAL/constructor、Data内部Auth accessor、跨runtime、per-read之间的切号间隙或永久挂起存储。** 不把客户端排他当服务器授权，不宣称真实资料/头像云端已接通。下一项对设备getUser/实际Data caller做范围明确的受控复现；资源/环境、后端部署及原生/Logo网络门禁仍保留，不重复未变化阻断。证据：`artifacts/release-readiness/20261017-profile-identity-ownership/integration.json`及NOTES、scope/review、原始日志。

## 2026-10-17 本轮补充：OAuth PKCE准备入口已协调，不关闭INITIAL或全flow竞争

独立caller审查发现native/default第三方signInWithOAuth未协调。两端分别先做真实SDK/生产入口/合成存储RED：另一owner忙时getter1、PKCE存储操作4、verifier存在且browser1，实际exit1；最初错误origin/query夹具失败不算有效产品RED。现仅将SDK调用和getter置于现有runAuthSessionOperation内，SDK存储未settle持续占有，browser等待位于锁外；原生Apple换票及Provider/client/coordinator不改。既有test:social-auth追加新正常行为套件，开关/依赖/配置不变。

专项12/12包含于关联53/53、TypeScript实际exit0，social/broker/Apple护栏exit0；独立APPROVE_SCOPE_ONLY。受控延迟写/存储错误、browser pending时实际生产URL→PKCE交换、disabled三Provider及无效回调控制通过。源码native/default为1910d41e…/6f3de726…，新test1aa8f428…，package仅测试命令变化；300输入其余297相同，无新APK/安卓/live Provider或云端通过。

**只关闭实际SDK准备期的排他缺口，不保证浏览器等待期的legacy verifier兼容、全flow/跨runtime或永久storage取消。完整constructor/INITIAL RED仍开放。** 独立审查还只读发现profileEditing.assertExpectedUser和deviceRepository.requireUserId未协调getUser；下一项优先对资料保存caller做实际RED，并要求caller timeout不提前释放仍在进行的SDK读取/refresh。此观察尚未新测，不将源码发现记为产品漏洞或通过。生产后端/新包/资源门禁不变，不重复未变化阻断。证据：`artifacts/release-readiness/20261017-social-oauth-ownership/integration.json`及NOTES、CALLER_AUDIT、scope/review、全部原始logs。

## 2026-10-17 本轮补充：取消意图同时约束 Provider 的迟到恢复提示

上一轮inbox只覆盖直接handler publication，真实Provider还有独立恢复导航入口。已通过真实installed SDK2.112.3公开recover→PKCE、生产Provider/service/coordinator/inbox及提取App handler/navigation复现：busy退出使callbackCancelled=true，但迟到PASSWORD_RECOVERY仍令Provider recovery=true、App reset导航=true（actualRED exit1）。不是用手发事件代替SDK，也不以旧15项直接handler覆盖宣称完整路径已验。

最小接线：Provider clearRecovery清hint/state，并保留当前busy revision；仅相同仍busy revision的恢复提示被抑制，原invalidate/readFresh/preparation继续，重复同revision仍屏蔽，idle与后续revision正常。App在退出busy早退前清Provider/local两处恢复提示，并明确“退出尚未执行”。不取消SDK、网络/会话写回、不提前释放lease、不自动退出或回滚；**忙时账号仍可能保持登录，必须等结束后重试退出**。

加强后联合3/3纳入关联273/273、TypeScript实际exit0，独立`APPROVE_RECOVERY_EVENT_RETIREMENT_ONLY`。before/after事件两种顺序均验证A→B新session确实接收/准备但不重置导航，下次公开恢复C可正常进入；另有idle/重复同revision/后续revision控制。最终证据只引用`final-joint-controls`与`frozen-regressions`，旧版本记录不覆写。App/Provider SHA ee9c68d5…/35477b28…；300项输入只变这2项，其余298一致。

范围限同runtime owned事件与installed版本，raw事件/其他runtime不在保证内；hooks/native/storage/HTTP为受控，非全React/Android/live Auth/RLS。完整隐藏INITIAL/bootstrap行为RED仍开放，NO-GO/正式0/20不变；旧f313包不含近期修改，无新构建或真实云端动作，不重试未变化阻断。证据：`artifacts/release-readiness/20261017-recovery-event-retirement/integration.json`及NOTES、scope/review、原始logs。

## 2026-10-17 本轮补充：App初始链接等待已接线，不关闭隐藏INITIAL门禁

真实提取App入口复现单次initialURL碰恢复owner忙后丢失的RED，新增内存inbox后在authLoading、账户流程及实际coordinator都允许时同步派发原service。最多pending1+active1、重复key共享、distinct overload拒绝；原validation/deduper保留，成功后才进入恢复页，无timer/不确定结果自动重发。通用UI busy仅作为账户流程结束的wake，不做gate，避免等待自身callback的第三方登录死锁。

退出意图清等待/消耗启动URL，然后仍遵守原busy guard；身份替换/卸载取消待处理和迟到UI，不取消已进入SDK的lease。首次未知恢复可保留，自身返回的精确user+session过渡只允许一次并丢弃旧pending。初始URL promise只读一次，effect即时重挂载不丢链接、不漏订阅；真正卸载下一microtask退役。prepared身份重置不能提前清回调busy。专项15/15纳入关联270/270，actual exit0/no timeout/skip/todo/cancel；最终产品TypeScript exit0，独立`APPROVE_CALLBACK_INBOX_ONLY`。

**仅显式coordinator调度切片，不是完整bootstrap修复。** controlled React/Linking/SDK边界不是全React或Android，永久storage挂起仍持有lease，UUID payload只作身份关联。App/inbox SHA887c9296…/583e0462…；300项App输入仅App变化+新增inbox，其余298不变，旧f313包不含近期修改。无新构建/安装/真实云或生产权限动作，NO-GO/正式0/20不变。证据：`artifacts/release-readiness/20261017-auth-callback-inbox/integration.json`、NOTES、scope/review及原始logs；已有完整隐藏INITIAL行为RED继续开放，不重试未变化环境阻断。

## 2026-10-17 11:25 补充：native手动单Auth与显式PKCE事件可行性，非产品接线

新增artifact限定3/3：standalone skipAutoInitialize构造后一turn存储/HTTP/events0；同栈initialize后唯一订阅，真实INITIAL延迟读保持owner/getAuth门禁；native INITIAL refresh失败后最终owned getSession传播SDK缓存错误，写0/存储保留/not-ready；公开resetPasswordForEmail生成verifier→exchangeCodeForSession消费后真实PASSWORD_RECOVERY，hold通知时exchange和owner不提前结束。实际exit0/no timeout/skip/todo/cancel且9proof源码一致；限定复核`APPROVE_MANUAL_AUTH_AND_PKCE_FEASIBILITY_ONLY`。仅在artifact，没有Data/token-cell/src/正常scripts接线。

**detectSessionInUrl=false是当前App配置边界；不证明init+INITIAL等待了隐式web URL恢复timer。** 重复init/listener、失败retry、退役中事件、Data freshness/native/SecureStore/Android未验证；不批准把实验fixture作为生产模块。前述完整createClient隐藏INITIAL读取RED仍开放，正常224和TypeScript本轮未重跑，不算新增通过。

只读App callback审计指出initial/foreground链接处理与authLoading独立，deduper不提供busy后的重新派发；这是源码路径观察，非本轮运行复现。下一步先复现实际App handler/service/coordinator的单URL受阻，再审查bounded内存待处理、validation/dedupe、logout/身份失效与无不确定网络自动重发合同。详见本轮`CALLBACK_BOUNDARY.md`。所有299项App输入不变、旧包不含近期修复，无原生/真实云端/部署，NO-GO及正式0/20。证据：`artifacts/release-readiness/20261017-manual-auth-bootstrap/completion.json`、NOTES、targeted/review。

## 2026-10-17 10:54 补充：冷启动fixture时钟隔离通过，INITIAL产品门禁不关闭

上一轮actual3/expected2先做受控差分而非放宽断言：从完整旧snapshot提取同SDK2.112.3/Provider/真实INITIAL与显式读/生产wrapper，健康body恢复1请求；只让首次在线body跨transport deadline则实际abort/reject→SDK额外retry成功，原+1断言继续失败3!==2。差分实际1pass/1expectedfail、exit1是fixture反例，不是产品RED。仅证明充分机制，不追溯认定历史失败唯一原因，不排除INITIAL双读竞争。两case全局写入数不同（控制含后续卸载refresh，cross断言先停）未混为相同轨迹。

正常夹具只改cold recovery单callback：独立固定transport now、立即可buffer健康body、真实offline10ms timer和SDK31s/61s时钟预算保留，wrapper仍构造真实Response；phase/ordinal/abort/outcome/busy诊断不含token/body/key。scope对比原30assert精确顺序、test外byte及产品src不变，299项App输入0变化。**Provider+fetch62/62，上一轮同范围auth关联224/224 actualexit0，无skip/todo/cancel/超时；62不可重复累加。** 本轮无新TypeScript/原生/真实云端通过。限定审查`APPROVE_COLD_RECOVERY_FIXTURE_ONLY`。

**只关闭夹具稳定化与同范围回归缺口，完整constructor/INITIAL外部owner竞争RED仍开放。** 不改产品15秒deadline/SDK/Provider/storage/权限；不承诺真实网络/本机存储或Android行为。旧223/224和INITIAL RED不覆写；无新包，NO-GO、正式设计0/20。下一步继续公开API启动归属的有界调查，不能拿本次GREEN当产品bootstrap修复。证据：`artifacts/release-readiness/20261017-cold-recovery-clock/integration.json`、NOTES及差分/最终回归/scope/快照/review。

下一步源码预查另记录在本轮`NEXT_STARTUP_SOURCE_AUDIT.md`：installed SDK2.112.3支持并透传`skipAutoInitialize`，但完整createClient仍注册内建INITIAL listener，flag单独不足以取得其完成归属；不将其当修复候选或新增测试通过。独立Auth受控初始化仍需与既有Data freshness/事件/存储/原生门禁一并审查。

## 2026-10-17 10:43 补充：邮件 PKCE 写入归属已修复，整体关联验收未完成

`resendSignupOtp`、旧`forgotPassword`及当前`sendPasswordRecoveryOtp`现先持有默认session-write owner，再进入getter及完整SDK PKCE准备/HTTP/错误清理。**这里是PKCE存储变更，不是隐式session refresh**；不构造新客户端、不改storage/Provider/fetch/SDK。busy竞争入口getter/存储/HTTP均0；成功保留callback verifier，失败清理settle之前owner不释放且不删除另一pending flow。部分PKCE准备抛错仍可能留下slot、永久storage挂起仍未解决。

Delivery-only exact request_timeout/status0/network反馈改为“邮件发送结果暂时无法确认，请先检查收件箱和垃圾邮件，稍后再试。”，rate-limit优先和verification反馈不变；旧forgotPassword返回SDK错误有意采用同delivery mapper，抛出的getter/storage错误身份不改。无自动重复发信，无“服务端取消/确认未投递”保证。最终SDK+提取App handler专项30/30、TypeScript exit0、旧OTP契约6/6；独立审查仅`APPROVE_MAIL_DELIVERY_OWNERSHIP_ONLY`。初始三次handler夹具失败保留，不当产品RED。

**全套相关回归224/223/1、实际exit1，仍未通过完整验收。** 既有cold recovery测试393行请求actual3/expected2；未改源码的隔离复查1/1不能抵消。双时钟+真实10ms健康buffer deadline为高可信夹具假设，但聚合日志不能排除已有INITIAL双read边界。下一步保留精确计数，补controlled clock/buffer及非秘密逐请求诊断，先定位再修；不放宽计数或反复求绿。详见本轮`REGRESSION_DIAGNOSIS.md`。

证据：`artifacts/release-readiness/20261017-email-delivery-ownership/integration.json`及完整RED/失败/专项/回归/类型/审查/scope。产品源码仅service三函数+otpError有限块，旧299项输入其余297未变，旧80条绑定其余78未变。**不关闭完整constructor/INITIAL排他、跨runtime或Android/真实邮件/云端门禁；NO-GO、正式设计0/20。** 无新包；下方历史结论原样保留。

## 2026-10-17 10:00 补充：改密验证码入口的隐式 refresh 已纳入排他与请求截止

本轮修复`sendReauthenticationNonce`：先取得默认session-write owner，再进入getter及完整`auth.reauthenticate()`。独立审查阻止了“只加锁却让永久nonce HTTP占住全局owner”的方案；生产fetch新增**精确GET `/auth/v1/reauthenticate`**分类，复用15秒单请求/body/monotonic deadline，非GET/相似路径旁路。超时为408/request_timeout，Auth版本头保留；不是整个SDK/存储/初始化15秒保证或服务端取消证明。

真实installed AuthClient2.112.3 + 生产service/coordinator/fetch的合成RED：健康无listener初始化结束后换expired存储，已有外部owner仍busy时raw入口实际refresh→nonce GET、读3/写1并轮换存储。修复后同场景getter/存储读写/HTTP均0；正常refresh、写回和nonce GET全程受同owner保护，真实SDK settle后释放。nonce网络丢失或deadline都显示“安全验证码发送结果暂时无法确认，请先检查邮箱，稍后再试。”，不自动重复发送；即使refresh在nonce前失败也保守用此文案。非目标SDK/配置错误身份、`getSession`原反馈不改。

最终相关Node回归**177/177**，含专项39项；TypeScript实际结果及限定审查见本轮`integration.json`，不可相加重复通过。源码改动仅service该函数及fetch分类/固定反馈，其他297项App输入不变；App handler仅被提取测试，未改App或宣称全Provider/原生渲染通过。忽略abort迟到响应/body、真实刷新失败预算、busy、错误释放、页面通知/去重均有证据。首次6项夹具失败保留并明确不是产品RED。

证据：`artifacts/release-readiness/20261017-reauth-session-ownership/integration.json`及NOTES、四组独立RED、final-targeted/final-auth-regressions/typecheck/review、快照与scope。**只关闭这个隐式Auth API入口，不关闭完整constructor/INITIAL、永久storage挂起或跨runtime问题。** 无新包/原生/云端通过，NO-GO、正式设计0/20。下方历史结论原样保留。

## 2026-10-17 09:23 补充：修复登录/注册在 busy 拒绝前进入客户端的顺序，完整启动缺口仍开放

本轮实际产品改动仅`authService.register/login`：先进入现有`runAuthSessionOperation`，再调用可能首次构造SDK的getter；getter仍在SDK错误映射try之外，配置/构造错误保持原对象。SDK Promise和映射由外层operation实际等待，未加队列、自动重试、第二个token cell或新client。注册本地校验仍先于operation。两条独立TDD RED均观察到busy时getter1次而期望0（真实child exit1），各自修复后通过；最终getter与SDK均在owner busy下进入，等待期间竞争操作拒绝，错误后正常释放。此处SDK/native边界为替身，coordinator与authService为真实生产代码，不是实际网络/安卓初始化复现。

最终相关Auth/Provider/截止/coordinator/native-refresh及登录注册回归 **154/154、TypeScript noEmit exit0**，均真实exitObserved且无超时/skip/todo/cancelled。30项service兼容测试已含在154项内，不重复相加。源码SHA **`8044ca6c65a34caa3a840ce8540fdfaca5d810904b8942d4e4f59c98712afc4c`**；其余298项App输入不变。独立审查及证据：`artifacts/release-readiness/20261017-auth-entry-ownership/integration.json`、各RED/GREEN、final regressions/typecheck、`CALLER_AUDIT.md`。

**只关闭这两个入口的取得所有权顺序，不关闭下面的INITIAL生命周期RED。** 构造内部已进入的监听工作仍可能延迟到operation结束后继续；Provider首次getter/订阅、Data请求隐式getSession、其他Auth入口、URL/原生生命周期仍需完整方案。公开split方向尚被生产采用门禁阻挡：它移除了Data请求时getSession/隐式刷新语义，必须先补未知/结果不确定状态拒绝、owned freshness、现有存储与URL/header/fetch兼容、单事件桥和native/Realtime生命周期。不能仅复制字符串token cell或静默退回public-key请求。

本轮无新APK/原生/云端通过，NO-GO、正式设计0/20不变；旧候选失败与历史artifact保持原样。下一步继续受控startup边界与兼容合同，不靠移动getter或计时器宣称完整bootstrap安全。

## 2026-10-17 09:00 补充：公开 Auth/Data 分离的合成可行性通过，尚未接入 App

证据：`artifacts/release-readiness/20261017-split-auth-data/integration.json`、`proof-001.json`、`combined-001.log`及`NOTES.md`。不改SDK私有字段、不叠加计时补丁，使用installed SDK2.112.3的公开standalone AuthClient + 一条SDK listener；Data createClient仅配置accessToken，回调只读内存cell，不调用Auth getter。Data客户端没有额外Auth构造/存储读取，其`.auth`明确拒绝。延迟唯一INITIAL读取期间getters未就绪且coordinator保持busy，竞争操作拒绝；放行后唯一refresh在owner内进入。此为移除第二条隐式初始路径的合成证据，不是上一候选或当前App的修复通过。

最终有界顺序命令实际 **exit0、exitObserved=true、无超时，8/8，无skip/todo/cancelled**。六项Auth涵盖延迟读取、失败/冷却/同实例重试、真实SDK合成恢复事件及identity切换、单次构造和消费者异常、销毁后旧Data引用、INITIAL已进入时销毁；两项Data涵盖无Auth存储入口及令牌轮换/退出后的12次REST/Storage/Functions请求。Data新增Auth读取/刷新0，显式owned refresh1。退出后是**不再携带用户令牌**：REST/Storage仍公开key bearer回退、Functions仍带apikey，不能写成匿名权限通过。Realtime只验证public setAuth调用及socket构造0，不是频道联网鉴权。恢复hint不是签名/授权依据。

独立草稿审查发现dispose保留token/hint/ready的采用阻断，已在artifact中补同步退役、迟到事件保护、实际初始化收敛和最终ready检查，增加两项销毁回归；最终限定复核见`review.json`。新增内存token引用**未获真实凭据/产品采用批准**；JS清引用不是物理零化，dispose也不删除SDK持久会话、不等于退出/撤销或取消已派发HTTP。永久storage挂起仍不能用计时器假释放。下一步先核对全部现有Auth/Data caller、Provider/native refresh及URL/PKCE恢复生命周期，再作安全与兼容接线决策；**不得直接采用实验fixture**。

本轮299项App输入与开轮完全一致，无新APK/原生/产品修复通过；现有生产RED仍有效，NO-GO、正式设计0/20不变。下方旧候选否证及历史artifact保持原样。

## 2026-10-17 08:28 补充：候选被延迟内建读取否证，已隔离，禁止接线

证据：`artifacts/release-readiness/20261017-owned-auth-lifecycle/integration.json`。本轮曾实现显式lease下的一次性构造/事件桥/getSession候选，但公开storage adapter的延迟读取测试发现：第2次session-key read（当前SDK的constructor初始监听读取）可先捕获旧expired快照并挂起；自有INITIAL与fresh getSession先完成，候选已ready且owner已idle；放行旧读取后SDK发起第二次refresh，实际两个请求进入时busy为`[true,false]`。移出前和归档后均 **exit1、0 pass/1 fail**，不是新增通过。

独立审查 **HIGH / REQUEST_CHANGES_DO_NOT_WIRE**。自有INITIAL、initialize和一次新getSession不是所有SDK初始任务的public join handle，不能靠固定延时、排空若干微任务、再读一次或SDK私有字段宣称解决。上轮成功路径1/1仍是限定场景的真实结果，但已不能据此推断没有其他悬挂初始任务。

两份本轮新建、从未接线的候选已在保存逐字节快照/SHA/失败日志后，从`src/services/ownedAuthLifecycle.ts`和`scripts/owned-auth-lifecycle.test.mjs`精确移出；既有产品源码未改，不是回滚已发布修复。可复跑失败位于artifact的`rejected-lifecycle.test.mjs`，只改导入路径，不进正常passing suite。归档候选的超时/冷却/同client显式重试独立用例1/1仅证明该局部行为，不抵消HIGH；恢复提示、错误的全部分支、卸载/native尚未完整通过。identity hint仅做UUID形状检查和JWT解码关联，**不是身份或签名验证**。

当前方案不能接入App。下一步应验证能提供单一可拥有初始化入口的公开API接法（含Auth与Data客户端职责分离的可能性），或取得上游可靠的初始化完成接口；不继续在此候选上叠加计时补丁。生产部署、真实账号/Storage、安卓和新包门禁不变，NO-GO、正式设计0/20。下文保留各轮原始限定结论。

## 2026-10-17 07:51 补充：两条入口已隔离，生产修复仍未接线

新增隔离证据：`artifacts/release-readiness/20261017-initial-session-isolation/integration.json`。三个同配置对照的最终命令为 **3 tests / 1 pass / 2 fail、exit1**，无skip/todo/cancelled：无监听的公开AuthClient不刷新、不改存储；完整createClient不挂Provider仍刷新1次并轮换合成存储；公开AuthClient加真实生产Provider也独立刷新1次并轮换合成存储。这消除了下文07:25记录中的“无法区分两条监听贡献”限制。只有挂Provider的场景，终端/资料/prepared保持0/null才是业务门禁证据；没有Provider的对照不能描述成它成功阻挡了业务准备。

另一个独立公开API成功路径实验 **1/1、exit0**：在同一生产coordinator owner内从头构造一次完整createClient，并立即注册实验监听；refresh和写入各1次。网络响应及存储提交等待时竞争操作都拒绝，竞争回调执行0次；真实事件顺序为storage-committed→TOKEN_REFRESHED→INITIAL_SESSION→barrier-settled。捕获initialize outcome后分别等待INITIAL及该outcome，未用早拒绝Promise.all/race释放owner。

这是**候选机制的成功路径可行性**，不证明已有生产singleton能被事后包住，也不是App修复或原生通过。错误/refresh失败、卸载竞争、真实SecureStore、native refresh接线、Provider事件桥和PASSWORD_RECOVERY连续性仍未验证；不得据此宣布完整bootstrap安全。每个场景使用独立合成客户端只是因果对照，不是生产重建客户端的修复方式。独立审查：`APPROVE_DIAGNOSTIC_AND_SUCCESS_PATH_FEASIBILITY_ONLY`。

下一实现边界：首次构造必须先获得所有权，单一长生命周期事件桥先于SDK构造注册本地消费者；Provider不再反复创建SDK listener；就绪getter不应暗中首次构造。**既有lease内的首次调用必须显式传入lease，不能调用无参等待idle的初始化而自锁。** `authService.getSession(lease)`、verifyOtp/logout/exchange等存在lease内getter调用；login/register又在lease前取client，不能只改一个调用点。`App.tsx`的Linking初始URL/URL事件effect没有authLoading门禁，不能仅凭显示Loading推断回调不会先触达服务。此为源码发现，不是本轮冷启动链接行为验收。

本轮产品源码和299项App输入均未改；下一轮继续本项，先补初始化失败与事件连续性实验，再接一次性初始化/事件桥及实际caller。不得用控制组通过或候选实验通过抵消两个生产排他合同RED。发布NO-GO、正式设计0/20、无新APK/安卓通过不变。下方保留07:25诊断范围，历史artifact不改写。

## 2026-10-17 07:25 记录：已复现，未修复

2026-10-17 本地诊断使用 installed Auth SDK 2.112.3、真实生产 AuthProvider / authService / coordinator / ingestion fence / fetch wrapper，Native 配置为 `autoRefreshToken: false`。React Native host、存储、HTTP、JWT、终端和资料边界均为合成夹具，不是安卓、真实 Auth、签名、RLS 或跨账户安全验收。

最终失败记录：`artifacts/release-readiness/20261017-initial-session-ownership/final-red.log`。单项实际 exit1、0 pass / 1 fail，无 skip / todo / cancelled。初始 SDK initialize 完成后确认存储未变且 refresh=0；随后由另一 operation 持有真实 coordinator，挂载 Provider，观察到该 owner 仍占用时 refresh=1，合成轮换 refresh token 已写入存储。终端登记=0、资料查询=0、prepared key=null，后续访问准备仍被挡住。

这证明 DOSO 同一 JS runtime 的排他约定存在一个绕过入口，**不证明真实账号接管、真实失效会话复活、服务器授权或 RLS 被绕过**。外部 owner 在此是一个持续未结的合成操作，不是实际删号、退出或设备撤销请求。产品源码本轮未修改，缺陷仍在。

## 已定位的因果

`src/auth/AuthContext.tsx` 当前 effect 先执行 `client.auth.onAuthStateChange`，再执行受 coordinator 保护的 `readFresh()`。installed SDK 的 `GoTrueClient.onAuthStateChange` 会异步执行 `_emitInitialSession`，内部调用 `_useSession` / `__loadSession`，读取过期会话时可刷新并写入存储。完整 `createClient()` 的构造流程还会通过 SupabaseClient._listenForAuthEvents 注册内建监听。

独立审查指出：当前夹具尚未隔离内建监听与 Provider 监听的单独因果贡献；SDK 还会合并并发 refresh。因此本轮只确认“生产式共享 SDK + Provider 挂载组合中，外部 owner 活跃时发生一次初始监听读取刷新及合成存储轮换”，不认定 Provider callback 是唯一发起者。`supabaseClient.ts` 模块在夹具中由提供真实 SDK auth 的 seam 替代，未验证真实 SecureStore 或该模块的全部启动流程。下一步须把共享客户端创建/内建监听的生命周期一并纳入，不只改 Provider。

已有 busy 检查只能延后 Provider 自己的读取；忽略 SDK callback、失效 prepared ticket 或调用 unsubscribe 都不能撤回已进入 SDK 的刷新。`autoRefreshToken: false` 关闭的是自动刷新调度，不代表这些会话读取不会刷新。此结论绑定当前 installed SDK，不外推未来版本。

## 修复边界（待实现与验证）

1. 在任何可能触发 SDK 初始读取前安排 operation 所有权，保持到真实读取结束，包括共享客户端创建时的内建监听。不能只等 Provider 的 getSession、使用提前结束的 race、或在某一路 reject 后释放仍有 SDK 工作的 lease。先用隔离对照补清各监听路径，再选择完整生命周期实现。
2. 保留真实 Auth 事件连续性。单纯“busy 时不订阅、idle 后才监听”会留下事件缺口；新读能恢复当前会话，但不能还原一次性的 `PASSWORD_RECOVERY` 语义。可评估在账户操作之前建立、由同一协调层拥有的单一长生命周期事件桥；Provider 只订阅桥接事件。该方向尚非已实现方案，需先验证初始化顺序和公开 API 可用性。
3. 只保留必要的非秘密恢复身份提示；不缓存、排队或重新发布旧 session / token，不绕过 ingestion fence、terminal preparation 或 server authority。
4. 卸载及 StrictMode effect 重放不能释放仍在运行的 SDK 初始读取，也不能无限等待已经 unsubscribe 而永远不再投递的 INITIAL_SESSION。清理不能产生后续 UI 写入或第二个并行初始读取。存储本身永久挂起时须保守保持排他，不能假称已取消。

不修改 node_modules 或 SDK 私有字段、不重建客户端绕过约束、不增加生产权限或自动重试凭据。现有公开 API 没有单独“只订阅、不触发初始读取”的选项；必须先处理这个生命周期边界。

## 必须通过的行为回归

| 场景 | 修复后应观察到 |
| --- | --- |
| 挂载前已有另一 operation busy | 无新增初始 refresh / 存储写入；不登记、不查询资料、不发布 prepared |
| 外部 operation 完成 | 从当前 SDK 状态恢复，不回放旧 token / session |
| 普通空闲冷启动过期会话 | 初始读取在同一协调所有权内完成；竞争写操作被拒绝，原生刷新保持暂停 |
| 初始读取失败、挂起或迟到 | 不提前释放仍进行中的工作；已过期准备结果不覆盖新状态 |
| 初始读取前/中卸载和 effect 重放 | 无卸载后 UI 写入、无悬空监听/等待、无并行初始读取 |
| busy 期间 PASSWORD_RECOVERY / SIGNED_OUT | 事件语义不丢失；恢复提示对应当前身份，退出清除提示 |
| 既有冷启动断网、缓存冷却与手动重试 | 保留上轮已验证约束，不制造请求循环或立即联网承诺 |

目前只有第一行的失败已被本轮直接复现；其余是修复验收要求，不计为本轮通过。正常套件上轮 133/133 是不同范围的历史结果，不能覆盖或抵消本项 RED。

## 复现与证据保全

在仓库根执行：

```powershell
node --test artifacts/release-readiness/20261017-initial-session-ownership/reproduce-busy-mount.test.mjs
```

当前预期 exit1，断言为 `refreshRequestsUnderExternalOwner === 0`。用例每次以 timestamp+pid 写入独立 `observation-*.json`（wx），不覆写本轮和历史证据；输出同时包含观测。它不在正常 passing suite，不要将其改为 skip/todo 取得绿色。真实修复应将等价回归接入常规测试并完成上述场景。

发布仍为 **NO-GO，正式设计 0/20**。无新 APK、安卓、完整后端/Storage、云端权限或真实账号操作。现有 Docker/WSL 环境问题仍待森哥答复，不重复请求或探测；先完成此本地认证修复，再按资源与环境门恢复新 QA 包和原生验收。
