/** app/page 的 *.config 勿 `import '@tarojs/taro'`（运行时），否则会触发 ENABLE_INNER_HTML 等构建错误。 */
export default {
  pages: [
    'pages/home/index',
    'pages/login/index',
    'pages/records/index',
    'pages/records/list/index',
    'pages/records/feeding/index',
    'pages/records/diaper/index',
    'pages/records/sleep/index',
    'pages/records/growth/index',
    'pages/profile/index',
    'pages/report/index',
    'pages/report/chart-test',
    'pages/index/index',
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#fff',
    navigationBarTitleText: '敏宝日记',
    navigationBarTextStyle: 'black',
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
