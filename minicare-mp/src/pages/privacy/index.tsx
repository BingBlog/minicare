/**
 * 隐私政策与用户服务协议页面
 *
 * 支持通过 URL 参数 ?tab=privacy 或 ?tab=terms 切换初始 Tab
 * 默认展示隐私政策
 *
 * 内容依据：
 * - 《中华人民共和国个人信息保护法》
 * - 《中华人民共和国网络安全法》
 * - 《中华人民共和国数据安全法》
 * - 微信小程序用户隐私保护指引规范（2024）
 *   https://developers.weixin.qq.com/miniprogram/dev/framework/user-privacy/miniprogram-intro.html
 *   https://developers.weixin.qq.com/miniprogram/dev/framework/user-privacy/PrivacyAuthorize.html
 */
import { View, Text, ScrollView, Image } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { useState } from 'react'
import { getStatusBarHeight } from '@/lib/safeArea'

import './index.scss'

const ICON_BACK = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#4a3035" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>')}`

type TabType = 'privacy' | 'terms'

export default function PrivacyPage() {
  const router = useRouter()
  const initialTab = (router.params.tab as TabType) || 'privacy'
  const [activeTab, setActiveTab] = useState<TabType>(initialTab)

  const handleBack = () => {
    const pages = Taro.getCurrentPages()
    if (pages.length > 1) {
      Taro.navigateBack()
    } else {
      Taro.reLaunch({ url: '/pages/home/index' })
    }
  }

  return (
    <View className='privacy-page'>
      {/* 导航栏 */}
      <View className='privacy-nav' style={{ paddingTop: `${getStatusBarHeight()}px` }}>
        <View className='privacy-nav__back' onClick={handleBack}>
          <Image src={ICON_BACK} style={{ width: 22, height: 22 }} />
        </View>
        <Text className='privacy-nav__title'>
          {activeTab === 'privacy' ? '隐私政策' : '用户服务协议'}
        </Text>
        <View style={{ width: 20 }} />
      </View>

      {/* Tab 切换 */}
      <View className='privacy-tabs'>
        <View
          className={`privacy-tabs__item ${activeTab === 'privacy' ? 'privacy-tabs__item--active' : ''}`}
          onClick={() => setActiveTab('privacy')}
        >
          <Text>隐私政策</Text>
        </View>
        <View
          className={`privacy-tabs__item ${activeTab === 'terms' ? 'privacy-tabs__item--active' : ''}`}
          onClick={() => setActiveTab('terms')}
        >
          <Text>用户服务协议</Text>
        </View>
      </View>

      {/* 内容区 */}
      <ScrollView scrollY className='privacy-content'>
        {activeTab === 'privacy' ? <PrivacyPolicy /> : <TermsOfService />}
      </ScrollView>
    </View>
  )
}

// ── 隐私政策 ──────────────────────────────────────────────────────

function PrivacyPolicy() {
  return (
    <View className='privacy-article'>
      <Text className='privacy-article__update'>更新日期：2025年5月3日 | 生效日期：2025年5月3日</Text>

      <Text className='privacy-article__h1'>敏宝日记隐私政策</Text>

      {/* 引导语 — 微信要求的标准引导语格式 */}
      <Text className='privacy-article__p'>
        本指引是微信小程序「敏宝日记」的开发者（以下简称"开发者"或"我们"）为处理你的个人信息而制定。
      </Text>
      <Text className='privacy-article__p'>
        我们深知个人信息对你的重要性，将严格遵守《中华人民共和国个人信息保护法》《中华人民共和国网络安全法》《中华人民共和国数据安全法》等相关法律法规，按照本隐私政策收集、使用、存储和保护你的个人信息。请你在使用敏宝日记前仔细阅读并充分理解本政策全部内容，做出你认为适当的选择。
      </Text>

      {/* 一、开发者处理的信息 — 微信规范要求的核心板块 */}
      <Text className='privacy-article__h2'>一、开发者处理的信息</Text>

      <Text className='privacy-article__p'>
        根据法律规定，开发者仅处理实现小程序功能所必要的信息。
      </Text>

      <Text className='privacy-article__h3'>1. 手机号码</Text>
      <Text className='privacy-article__p'>
        当你注册和登录敏宝日记时，开发者会收集你的手机号码，用于创建账户和身份验证。我们通过短信验证码方式验证你的身份，验证码仅用于当次登录验证，不会被长期存储。手机号码是提供服务所必需的信息，若你不提供则无法完成注册和登录。我们不会以任何方式请求或收集你的微信用户名、微信密码或其他微信账号凭证信息。
      </Text>

      <Text className='privacy-article__h3'>2. 宝宝信息</Text>
      <Text className='privacy-article__p'>
        为提供核心的宝宝成长记录功能，你可以主动填写宝宝的昵称、出生日期、性别、过敏类型及过敏等级等信息。这些信息完全由你自主决定是否提供，用于帮助你记录和分析宝宝的成长数据，不会用于此目的之外的用途。
      </Text>

      <Text className='privacy-article__h3'>3. 日常记录数据</Text>
      <Text className='privacy-article__p'>
        在使用记录功能时，你填写的喂养、尿布更换、睡眠、生长发育、健康状况、活动、症状表现及就医等记录数据，均由你主动提供并存储在我们的服务器中，用于帮助你追踪和分析宝宝的日常状况。
      </Text>

      <Text className='privacy-article__h3'>4. 家庭协作信息</Text>
      <Text className='privacy-article__p'>
        为提供家庭成员协作功能，当你邀请家庭成员加入时，开发者会收集被邀请人的手机号码，用于发送邀请和关联账号。被邀请人的手机号码仅用于此目的，不会用于其他用途。
      </Text>

      <Text className='privacy-article__h3'>5. 选中的照片信息</Text>
      <Text className='privacy-article__p'>
        开发者收集你选中的照片信息，用于就医记录中上传病历、检查报告等图片留档保存。该功能由你主动触发，你可以选择从相册选取或通过摄像头拍摄，仅在你主动操作时访问。
      </Text>

      <Text className='privacy-article__h3'>6. 剪切板</Text>
      <Text className='privacy-article__p'>
        为方便你复制联系邮箱等信息，开发者将在你主动点击"复制"按钮时读取你的剪切板。该操作仅在你明确触发时发生，不会在后台自动读取或监控你的剪切板内容。
      </Text>

      <Text className='privacy-article__h3'>7. 开发者不处理的信息</Text>
      <Text className='privacy-article__p'>
        敏宝日记不会收集你的地理位置信息，不会访问你的通讯录，不会获取你的设备唯一标识符，不会收集你的微信昵称和头像，不会访问你的麦克风或蓝牙，不会读取你的微信运动步数。未经你的明确授权同意，我们不会获取上述任何信息。
      </Text>

      {/* 二、第三方插件信息 */}
      <Text className='privacy-article__h2'>二、第三方插件信息</Text>
      <Text className='privacy-article__p'>
        敏宝日记当前未接入任何第三方插件。如后续接入第三方插件，我们将在本隐私政策中进行更新说明，并向你明确告知第三方插件的信息处理规则。
      </Text>

      {/* 三、第三方服务商信息 */}
      <Text className='privacy-article__h2'>三、第三方服务商信息</Text>
      <Text className='privacy-article__p'>
        敏宝日记由开发者自主开发和运营，当前未委托任何第三方服务商进行代开发。我们使用腾讯云 CloudBase（云开发）提供基础设施服务，包括云函数计算和数据库存储。腾讯云作为基础设施提供商，按照其服务协议和隐私政策处理相关数据，不会将你的个人数据用于与本小程序服务无关的用途。
      </Text>

      {/* 四、用户权益 — 微信规范要求的标准用户权益说明 */}
      <Text className='privacy-article__h2'>四、用户权益</Text>

      <Text className='privacy-article__h3'>1. 撤回授权</Text>
      <Text className='privacy-article__p'>
        关于收集你选中的照片信息，你可以通过以下路径撤回对开发者的授权：小程序主页右上角"..." - "设置" - 点击特定信息 - 点击"不允许"。撤回授权后，就医记录的图片上传功能将不可用，但不影响其他功能的正常使用。
      </Text>

      <Text className='privacy-article__h3'>2. 访问和修改</Text>
      <Text className='privacy-article__p'>
        你可以随时在应用内访问和修改你的个人信息，包括宝宝档案信息和各类记录数据。
      </Text>

      <Text className='privacy-article__h3'>3. 删除数据</Text>
      <Text className='privacy-article__p'>
        你可以随时删除你的记录数据。删除后相关数据将从我们的服务器上永久移除，不可恢复。
      </Text>

      <Text className='privacy-article__h3'>4. 注销账号</Text>
      <Text className='privacy-article__p'>
        你有权注销你的账号。你可以通过小程序内「我的」页面中的「联系我们」功能，发送邮件申请注销账号。账号注销后，我们将停止为你提供服务，并在15个工作日内删除你的所有个人信息和相关数据，法律法规另有规定的除外。注销操作不可逆，请在操作前做好数据备份。
      </Text>

      <Text className='privacy-article__h3'>5. 其他法定权利</Text>
      <Text className='privacy-article__p'>
        关于你的个人信息，你可以通过以下方式与开发者联系，行使查阅、复制、更正、删除等法定权利：邮箱 abingblog@gmail.com。
      </Text>

      {/* 五、开发者对信息的存储 — 微信规范要求 */}
      <Text className='privacy-article__h2'>五、开发者对信息的存储</Text>
      <Text className='privacy-article__p'>
        我们在中华人民共和国境内收集和产生的个人信息，将存储在中国境内的腾讯云服务器上，不会进行跨境传输。
      </Text>
      <Text className='privacy-article__p'>
        存储期限：你的个人信息将在你使用本服务期间持续存储。当你注销账号后，我们将在15个工作日内删除你的个人信息，法律法规另有要求的除外。如你长期未登录使用（超过24个月），我们可能会对你的数据进行匿名化处理，届时将提前通知你。
      </Text>

      {/* 六、信息的使用规则 — 微信规范要求 */}
      <Text className='privacy-article__h2'>六、信息的使用规则</Text>
      <Text className='privacy-article__p'>
        开发者将会在本指引所明示的用途内使用收集的信息。
      </Text>
      <Text className='privacy-article__p'>
        如开发者使用你的信息超出本指引目的或合理范围，开发者必须在变更使用目的或范围前，再次以弹窗方式告知并征得你的明示同意。
      </Text>

      {/* 七、信息的安全保护 */}
      <Text className='privacy-article__h2'>七、信息的安全保护</Text>
      <Text className='privacy-article__p'>
        我们已采取符合业界标准的安全防护措施保护你的个人信息，防止数据遭到未经授权的访问、公开披露、使用、修改、损坏或丢失。具体措施包括：使用 HTTPS 加密技术确保数据传输的保密性；使用受信赖的保护机制防止数据遭到恶意攻击；部署访问控制机制确保只有授权人员才可以访问个人信息；对存储的敏感数据（如手机号码）进行加密处理。我们不会要求你降低手机操作系统的安全性（如越狱、ROOT 等）来使用本应用的任何功能。
      </Text>

      {/* 八、信息对外提供 — 微信规范要求 */}
      <Text className='privacy-article__h2'>八、信息对外提供</Text>
      <Text className='privacy-article__p'>
        开发者承诺，不会主动共享或转让你的信息至任何第三方，如存在确需共享或转让时，开发者应当直接征得或确认第三方征得你的单独同意。
      </Text>
      <Text className='privacy-article__p'>
        开发者承诺，不会对外公开披露你的信息，如必须公开披露时，开发者应当向你告知公开披露的目的、披露信息的类型及可能涉及的信息，并征得你的单独同意。
      </Text>
      <Text className='privacy-article__p'>
        以下情况除外：根据法律法规的规定或行政、司法机关的强制性要求进行共享或披露；在家庭协作功能中，你主动邀请的家庭成员可查看共同的宝宝记录数据，此共享范围由你自主控制。
      </Text>

      {/* 九、未成年人保护 */}
      <Text className='privacy-article__h2'>九、未成年人保护</Text>
      <Text className='privacy-article__p'>
        敏宝日记主要面向婴幼儿的监护人使用。若你是未满18周岁的未成年人，请在监护人的陪同下阅读本隐私政策，并在获得监护人的同意后使用我们的服务。我们不会主动收集未成年人的个人信息。如果监护人发现我们在未获得其同意的情况下收集了未成年人的个人信息，可通过本政策中的联系方式联系我们，我们将尽快删除相关信息。
      </Text>

      {/* 十、隐私政策的修订 */}
      <Text className='privacy-article__h2'>十、隐私政策的修订</Text>
      <Text className='privacy-article__p'>
        我们可能适时修订本隐私政策。当隐私政策发生变更时，我们会在小程序内以弹窗或页面提示等方式通知你，并在更新后的隐私政策页面顶部标注更新日期。若你在隐私政策修订后继续使用我们的服务，即表示你同意接受修订后的隐私政策。若你不同意修订后的内容，你有权停止使用本服务。
      </Text>

      {/* 十一、联系方式 — 微信规范要求 */}
      <Text className='privacy-article__h2'>十一、联系方式</Text>
      <Text className='privacy-article__p'>
        你认为开发者未遵守上述约定，或有其他的投诉建议、或未成年人个人信息保护相关问题，可通过以下方式与开发者联系；或者向微信进行投诉。
      </Text>
      <Text className='privacy-article__p'>
        邮箱：abingblog@gmail.com
      </Text>
      <Text className='privacy-article__p'>
        我们将在15个工作日内回复你的请求。
      </Text>
    </View>
  )
}

// ── 用户服务协议 ──────────────────────────────────────────────────

function TermsOfService() {
  return (
    <View className='privacy-article'>
      <Text className='privacy-article__update'>更新日期：2025年5月3日 | 生效日期：2025年5月3日</Text>

      <Text className='privacy-article__h1'>敏宝日记用户服务协议</Text>

      <Text className='privacy-article__p'>
        欢迎你使用敏宝日记！请你仔细阅读以下条款，在注册成为用户或使用本服务之前，请确认你已充分阅读、理解并接受本协议的全部内容。如你不同意本协议中的任何条款，请勿注册或使用本服务。
      </Text>

      <Text className='privacy-article__h2'>一、定义与服务内容</Text>
      <Text className='privacy-article__p'>
        敏宝日记是一款专为过敏宝宝家庭打造的成长记录微信小程序，提供宝宝日常记录（喂养、尿布、睡眠、生长发育、健康、活动、症状、就医等）、数据统计分析、家庭成员协作等功能。本应用提供的信息和数据仅供家庭日常记录参考，不构成任何医疗建议，不能替代专业医疗诊断和治疗。你无需登录即可浏览部分功能和示例数据，注册登录后可使用完整功能。
      </Text>

      <Text className='privacy-article__h2'>二、账户注册与使用</Text>
      <Text className='privacy-article__p'>
        你需要使用手机号码注册登录后才能使用完整功能。我们通过短信验证码方式完成注册和登录，不会要求你提供微信账号密码或其他平台的登录凭证。你应确保注册信息的真实性，并妥善保管账户信息。如因你的原因导致账户被他人使用而造成的损失，由你自行承担。每个手机号码仅能注册一个账户。
      </Text>

      <Text className='privacy-article__h2'>三、账号注销</Text>
      <Text className='privacy-article__p'>
        你有权随时申请注销账号。你可以通过小程序内「我的」页面的「联系我们」功能，向邮箱 abingblog@gmail.com 发送注销申请。账号注销后，我们将停止为你提供服务，并根据《敏宝日记隐私政策》的约定，在15个工作日内删除你的所有个人信息和相关数据。注销操作不可逆，一旦注销完成，你的账号信息和记录数据将无法恢复，请在操作前做好数据备份。
      </Text>

      <Text className='privacy-article__h2'>四、用户隐私与数据安全</Text>
      <Text className='privacy-article__p'>
        我们重视你的隐私和数据安全。关于数据收集范围、使用方式、存储期限和安全保护措施的详细说明，请参阅《敏宝日记隐私政策》。我们承诺：仅在本隐私政策明示的用途内使用收集的信息；不会将收集到的用户数据进行出售、交易或越权披露；不会在任何页面请求或诱导你输入微信用户名或密码；未经你的明确授权同意，不会显示你的微信头像、昵称等个人信息。
      </Text>

      <Text className='privacy-article__h2'>五、用户行为规范</Text>
      <Text className='privacy-article__p'>
        你在使用本服务时应遵守中华人民共和国相关法律法规。你不得利用本服务进行任何违法或不当行为，不得上传、发布含有违法、有害、威胁、侮辱、诽谤等内容的信息。你对在本应用中记录的内容负责，应确保其合法合规。
      </Text>

      <Text className='privacy-article__h2'>六、设备与系统安全</Text>
      <Text className='privacy-article__p'>
        敏宝日记的所有功能均在标准操作系统环境下运行。我们不会要求你降低手机操作系统的安全性（如要求 iPhone 用户越狱、Android 用户 ROOT 等）后方能使用相关功能。如你的设备处于非标准安全状态，可能导致数据安全风险，我们对此不承担责任。
      </Text>

      <Text className='privacy-article__h2'>七、知识产权</Text>
      <Text className='privacy-article__p'>
        敏宝日记的所有内容，包括但不限于文字、图片、软件、界面设计、版面框架等，均受中华人民共和国知识产权相关法律法规的保护。你记录的个人内容的知识产权归你所有，但你授予我们为提供服务所必需的有限使用权。
      </Text>

      <Text className='privacy-article__h2'>八、免责声明</Text>
      <Text className='privacy-article__p'>
        本应用提供的记录、分析功能仅为家庭日常记录辅助工具，所有数据和分析结果仅供参考，不具有医学诊断价值。如宝宝出现健康问题，请及时就医，以专业医疗机构的诊断和建议为准。因不可抗力或非我们可控因素导致的服务中断或数据损失，我们不承担责任，但将尽力减少影响并及时通知你。
      </Text>

      <Text className='privacy-article__h2'>九、服务变更与终止</Text>
      <Text className='privacy-article__p'>
        我们有权根据实际情况修改或调整服务内容，重大变更将提前通知用户。如你违反本协议，我们有权暂停或终止向你提供服务。服务终止后，我们将按照《敏宝日记隐私政策》的约定处理你的个人数据。
      </Text>

      <Text className='privacy-article__h2'>十、协议修订</Text>
      <Text className='privacy-article__p'>
        我们有权根据需要修订本协议，修订后的协议将在小程序内公布。若你在协议修订后继续使用本服务，即视为你同意接受修订后的协议内容。如你不同意修订后的协议，你可以停止使用本服务并申请注销账号。
      </Text>

      <Text className='privacy-article__h2'>十一、法律适用与争议解决</Text>
      <Text className='privacy-article__p'>
        本协议的订立、执行、解释及争议解决均适用中华人民共和国大陆地区法律。如发生争议，双方应友好协商解决；协商不成的，任何一方均可向有管辖权的人民法院提起诉讼。
      </Text>

      <Text className='privacy-article__h2'>十二、联系方式</Text>
      <Text className='privacy-article__p'>
        如你对本协议有任何疑问、意见或建议，可通过以下方式联系我们：邮箱 abingblog@gmail.com。我们将在15个工作日内回复你的请求。
      </Text>
    </View>
  )
}
