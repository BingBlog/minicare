/** app/page 的 *.config 勿 `import '@tarojs/taro'`（运行时），否则会触发 ENABLE_INNER_HTML 等构建错误。 */
export default {
  pages: [
    'pages/home/index',
    'pages/records/list/index',
    'pages/report/index',
    'pages/profile/index',
    'pages/index/index',
  ],
  subPackages: [
    {
      root: 'pages/login',
      pages: ['index'],
    },
    {
      root: 'pages/onboarding',
      pages: ['index'],
    },
    {
      root: 'pages/privacy',
      pages: ['index'],
    },
    {
      root: 'pages/dashboard',
      pages: ['index'],
    },
    {
      root: 'pages/records/feeding',
      pages: ['index'],
    },
    {
      root: 'pages/records/diaper',
      pages: ['index'],
    },
    {
      root: 'pages/records/sleep',
      pages: ['index'],
    },
    {
      root: 'pages/records/growth',
      pages: ['index'],
    },
    {
      root: 'pages/records/health',
      pages: ['index'],
    },
    {
      root: 'pages/records/medical',
      pages: ['index'],
    },
    {
      root: 'pages/records/activity',
      pages: ['index'],
    },
    {
      root: 'pages/records/symptom',
      pages: ['index'],
    },
  ],
  resizable: true,
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#fff',
    navigationBarTitleText: '敏宝日记',
    navigationBarTextStyle: 'black',
    navigationStyle: 'custom',
    pageOrientation: 'auto',
  },
  tabBar: {
    custom: true,
    color: '#a89399',
    selectedColor: '#f87098',
    list: [
      { pagePath: 'pages/home/index', text: '首页' },
      { pagePath: 'pages/records/list/index', text: '记录' },
      { pagePath: 'pages/report/index', text: '分析' },
      { pagePath: 'pages/profile/index', text: '我的' },
    ],
  },
}
