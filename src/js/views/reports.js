/* Reports View — overview, security, accessibility, and dimension breakdowns */
const ReportsView = (() => {

  // ── Shared helpers ───────────────────────────────────────────────────────────
  function scoreLabel(s) { return s >= 75 ? t('dashboard.scoreGood') : s >= 50 ? t('dashboard.scoreFair') : t('dashboard.scorePoor'); }

  // ── Filter state ─────────────────────────────────────────────────────────────
  // Persists for the lifetime of the Reports view; reset on each render() call.
  let _filter      = {};   // { customerId?, healthCheckId? }
  let _allCustomers = [];  // cached customer list for the picker
  let _ssCust      = null; // SearchableSelect instance for reportCustomer
  let _ssHc        = null; // SearchableSelect instance for reportHealthCheck

  // ── Entry point ─────────────────────────────────────────────────────────────
  async function render(container, params = {}) {
    _filter       = {};
    _allCustomers = [];
    _ssCust       = null;
    _ssHc         = null;
    const _initialTab = params.tab || 'overview';

    container.innerHTML = `
      <div class="page-header">
        <div class="page-header-row">
          <div><h1>${t('reports.title')}</h1><p>${t('reports.subtitle')}</p></div>
          <div class="flex gap-8 items-center" style="flex-wrap:wrap">

            <!-- Customer picker -->
            <select class="filter-select" id="reportCustomer" style="min-width:160px">
              <option value="">${t('reports.allCustomers')}</option>
            </select>

            <!-- Health-check picker (shown only when a customer is selected) -->
            <select class="filter-select" id="reportHealthCheck" style="min-width:180px;display:none">
              <option value="">${t('reports.allHealthChecks')}</option>
            </select>

            <!-- Period picker -->
            <select class="filter-select" id="reportPeriod">
              <option value="0">${t('reports.allTime')}</option>
              <option value="30">${t('reports.last30')}</option>
              <option value="90">${t('reports.last90')}</option>
            </select>
          </div>
        </div>

        <!-- Active-filter chip (visible when a customer or HC is selected) -->
        <div id="reportFilterChip" style="display:none;margin-top:8px;align-items:center;gap:8px;flex-wrap:wrap"></div>
      </div>

      <div class="tabs" id="reportTabs">
        <button class="tab-btn active" data-tab="overview">
        <svg style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M6.17871 18.8223C5.98633 18.8223 5.79492 18.749 5.64844 18.6025C5.35547 18.3096 5.35547 17.834 5.64844 17.542L6.58692 16.6045C6.87989 16.3105 7.3545 16.3125 7.64747 16.6045C7.94044 16.8975 7.94044 17.373 7.64747 17.665L6.70899 18.6025C6.56251 18.749 6.37011 18.8223 6.17871 18.8223Z" fill="currentColor"/>
          <path d="M1.91797 14.6025C1.72559 14.6025 1.53418 14.5293 1.3877 14.3828C1.09473 14.0898 1.09473 13.6143 1.3877 13.3223L2.32618 12.3848C2.62013 12.0908 3.09473 12.0928 3.38673 12.3848C3.6797 12.6777 3.6797 13.1533 3.38673 13.4453L2.44825 14.3828C2.30177 14.5293 2.10937 14.6025 1.91797 14.6025Z" fill="currentColor"/>
          <path d="M2.49805 18.252C2.30664 18.252 2.11524 18.1797 1.96875 18.0342C1.67578 17.7412 1.67383 17.2666 1.96582 16.9727L4.46191 14.4629C4.75586 14.1709 5.22949 14.168 5.52343 14.46C5.8164 14.7529 5.81835 15.2275 5.52636 15.5215L3.03027 18.0313C2.88281 18.1777 2.69044 18.252 2.49805 18.252Z" fill="currentColor"/>
          <path d="M18.1797 1.66213C17.543 1.07717 16.6045 0.874035 15.3984 1.0508C13.074 1.39504 11.2261 2.66018 9.74242 4.0718C9.36962 4.02663 8.99511 3.99928 8.6494 4.00002C5.6621 4.02931 2.89256 5.64845 1.24022 8.33302C0.934557 8.82911 0.920877 9.45119 1.20506 9.95411C1.48729 10.4531 1.99705 10.75 2.56541 10.75H5.3679C5.4553 11.262 5.69651 11.7468 6.08006 12.1299L7.8701 13.9199C8.25706 14.3076 8.74168 14.5437 9.24998 14.6314V17.4131C9.2451 17.9942 9.54197 18.5108 10.0459 18.7949C10.2871 18.9307 10.5556 18.999 10.8252 18.999C11.1162 18.999 11.4092 18.919 11.6679 18.7598C14.3515 17.1074 15.9707 14.3379 16 11.3506C16.0031 10.989 15.9743 10.6192 15.9282 10.2486C15.999 10.1743 16.082 10.0987 16.1504 10.0244C17.7021 8.34377 18.6113 6.61819 18.9297 4.74709C19.1611 3.38771 18.9014 2.32131 18.1797 1.66213ZM5.79003 8.83986C5.71288 8.95119 5.64941 9.06544 5.59179 9.18361L5.58886 9.18947C5.57934 9.20925 5.57421 9.23 5.56518 9.25002H2.62353C2.54443 9.25002 2.49365 9.16018 2.53491 9.09278C3.8164 7.00441 6.02099 5.63796 8.3584 5.52223C8.25195 5.64454 8.13965 5.76857 8.03809 5.88869C7.31739 6.74025 6.56152 7.73244 5.79003 8.83986ZM10.9077 17.4619C10.8403 17.5037 10.75 17.4529 10.75 17.3738V14.4385C10.8914 14.374 11.0298 14.3006 11.1611 14.209C12.4473 13.313 13.5327 12.461 14.478 11.6297C14.3611 13.9712 13.0129 16.1592 10.9077 17.4619ZM17.4512 4.49513C17.1826 6.07129 16.3975 7.54689 15.0488 9.00685C13.8896 10.2617 12.3379 11.5606 10.3037 12.9785C9.87402 13.2783 9.29785 13.2266 8.93066 12.8594L7.14062 11.0684C6.82031 10.749 6.73925 10.2578 6.9375 9.84474C6.96289 9.79395 6.98926 9.74317 7.02148 9.69629C7.76562 8.62891 8.49316 7.67384 9.18261 6.85743C10.7949 4.95216 12.8193 2.94825 15.6172 2.53516C16.1279 2.45899 16.8086 2.43946 17.167 2.76856C17.6015 3.16602 17.5312 4.0215 17.4512 4.49513Z" fill="currentColor"/>
          <path d="M14.5 6.75C14.5 7.44036 13.9404 8 13.25 8C12.5596 8 12 7.44036 12 6.75C12 6.05964 12.5596 5.5 13.25 5.5C13.9404 5.5 14.5 6.05964 14.5 6.75Z" fill="currentColor"/>
        </svg>

        ${t('reports.tabOverview')}</button>
        <button class="tab-btn" data-tab="security">
        <svg style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M11.25 11.5C11.25 10.8105 10.6895 10.25 10 10.25C9.31055 10.25 8.75 10.8105 8.75 11.5C8.75 11.9026 8.95361 12.2449 9.25 12.4736V13.25C9.25 13.6641 9.58594 14 10 14C10.4141 14 10.75 13.6641 10.75 13.25V12.4736C11.0464 12.2449 11.25 11.9026 11.25 11.5Z" fill="currentColor"/>
          <path d="M15 7.02539V6.5C15 3.74316 12.7568 1.5 10 1.5C7.24316 1.5 5 3.74316 5 6.5V7.02539C3.87842 7.15161 3 8.09546 3 9.25V15.75C3 16.9902 4.00977 18 5.25 18H14.75C15.9902 18 17 16.9902 17 15.75V9.25C17 8.09546 16.1216 7.15161 15 7.02539ZM10 3C11.9297 3 13.5 4.57031 13.5 6.5V7H6.5V6.5C6.5 4.57031 8.07031 3 10 3ZM15.5 15.75C15.5 16.1631 15.1631 16.5 14.75 16.5H5.25C4.83691 16.5 4.5 16.1631 4.5 15.75V9.25C4.5 8.83691 4.83691 8.5 5.25 8.5H14.75C15.1631 8.5 15.5 8.83691 15.5 9.25V15.75Z" fill="currentColor"/>
        </svg>
        ${t('reports.tabSecurity')}
        </button>

        <button class="tab-btn" data-tab="accessibility">
        <svg  style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M13.9173 8.1499C13.8675 8.15991 13.0374 8.41992 11.8175 8.57995C11.5675 8.61999 11.3773 8.82995 11.3773 9.07995V10.22C11.3773 10.31 11.3875 10.3999 11.4073 10.49L12.6273 14.8C12.7374 15.1999 12.5074 15.61 12.1073 15.72C12.0374 15.74 11.9674 15.75 11.9073 15.75C11.5775 15.75 11.2774 15.53 11.1773 15.1999L10.2674 11.9499C10.2274 11.8299 10.1175 11.75 9.99741 11.75C9.87729 11.75 9.76743 11.8299 9.72739 11.9499L8.81748 15.1999C8.71738 15.53 8.41733 15.75 8.0875 15.75C8.02744 15.75 7.95737 15.74 7.88755 15.72C7.4874 15.61 7.25742 15.1999 7.36753 14.8L8.5875 10.49C8.60728 10.3999 8.61753 10.31 8.61753 10.22V9.07995C8.61753 8.82995 8.42734 8.61999 8.17734 8.58996C6.94736 8.42993 6.11753 8.15991 6.06748 8.14001C5.67734 8.01001 5.46738 7.58996 5.59751 7.19995C5.72739 6.80005 6.14731 6.58996 6.53745 6.71997C6.55747 6.71997 8.05747 7.20996 9.99741 7.20996C11.9073 7.20996 13.4474 6.71997 13.4574 6.71997C13.8573 6.58997 14.2774 6.81006 14.4073 7.19995C14.5274 7.58996 14.3175 8.02002 13.9173 8.1499Z" fill="currentColor"/>
          <path d="M10 6.25C10.6904 6.25 11.25 5.69036 11.25 5C11.25 4.30964 10.6904 3.75 10 3.75C9.30964 3.75 8.75 4.30964 8.75 5C8.75 5.69036 9.30964 6.25 10 6.25Z" fill="currentColor"/>
          <path d="M10 18.75C5.1748 18.75 1.25 14.8252 1.25 10C1.25 5.1748 5.1748 1.25 10 1.25C14.8252 1.25 18.75 5.1748 18.75 10C18.75 14.8252 14.8252 18.75 10 18.75ZM10 2.75C6.00195 2.75 2.75 6.00195 2.75 10C2.75 13.998 6.00195 17.25 10 17.25C13.998 17.25 17.25 13.998 17.25 10C17.25 6.00195 13.998 2.75 10 2.75Z" fill="currentColor"/>
        </svg>

        ${t('reports.tabAccessibility')}
        </button>
        <button class="tab-btn" data-tab="usability">
        <svg style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M10 14.5C8.07327 14.5 6.71732 13.3706 6.66067 13.3223C6.34426 13.0547 6.3052 12.5816 6.57278 12.2652C6.83987 11.9497 7.31301 11.9087 7.62942 12.1778C7.63674 12.1836 8.63772 13 10 13C11.3711 13 12.4175 12.1753 12.4278 12.1665C12.75 11.9087 13.2222 11.9585 13.4815 12.2798C13.7407 12.6006 13.6934 13.0703 13.3736 13.3311C13.315 13.3789 11.919 14.5 10 14.5Z" fill="currentColor"/>
          <path d="M7.25 9.25C7.94036 9.25 8.5 8.69036 8.5 8C8.5 7.30964 7.94036 6.75 7.25 6.75C6.55964 6.75 6 7.30964 6 8C6 8.69036 6.55964 9.25 7.25 9.25Z" fill="currentColor"/>
          <path d="M12.75 9.25C13.4404 9.25 14 8.69036 14 8C14 7.30964 13.4404 6.75 12.75 6.75C12.0596 6.75 11.5 7.30964 11.5 8C11.5 8.69036 12.0596 9.25 12.75 9.25Z" fill="currentColor"/>
          <path d="M10 18.75C5.17529 18.75 1.25 14.8247 1.25 10C1.25 5.17529 5.17529 1.25 10 1.25C14.8247 1.25 18.75 5.17529 18.75 10C18.75 14.8247 14.8247 18.75 10 18.75ZM10 2.75C6.00244 2.75 2.75 6.00244 2.75 10C2.75 13.9976 6.00244 17.25 10 17.25C13.9976 17.25 17.25 13.9976 17.25 10C17.25 6.00244 13.9976 2.75 10 2.75Z" fill="currentColor"/>
          <path d="M9.97756 14.5C8.05129 14.5 6.69533 13.3701 6.63869 13.3223C6.32228 13.0547 6.28322 12.5811 6.5508 12.2656C6.81789 11.9483 7.29103 11.9102 7.60744 12.1777C7.61476 12.1836 8.61574 13 9.97756 13C11.3487 13 12.395 12.1748 12.4053 12.167C12.7276 11.9082 13.1992 11.959 13.459 12.2793C13.7183 12.6006 13.6709 13.0703 13.3511 13.3311C13.2925 13.3789 11.8965 14.5 9.97756 14.5Z" fill="currentColor"/>
          <path d="M7.25 9.27304C7.94036 9.27304 8.5 8.7134 8.5 8.02304C8.5 7.33269 7.94036 6.77304 7.25 6.77304C6.55964 6.77304 6 7.33269 6 8.02304C6 8.7134 6.55964 9.27304 7.25 9.27304Z" fill="currentColor"/>
          <path d="M12.75 9.27304C13.4404 9.27304 14 8.7134 14 8.02304C14 7.33269 13.4404 6.77304 12.75 6.77304C12.0596 6.77304 11.5 7.33269 11.5 8.02304C11.5 8.7134 12.0596 9.27304 12.75 9.27304Z" fill="currentColor"/>
          <path d="M10 18.75C5.17529 18.75 1.25 14.8252 1.25 10C1.25 5.1748 5.17529 1.25 10 1.25C14.8247 1.25 18.75 5.1748 18.75 10C18.75 14.8252 14.8247 18.75 10 18.75ZM10 2.75C6.00244 2.75 2.75 6.00195 2.75 10C2.75 13.998 6.00244 17.25 10 17.25C13.9976 17.25 17.25 13.998 17.25 10C17.25 6.00195 13.9976 2.75 10 2.75Z" fill="currentColor"/>
        </svg>

        ${t('reports.tabUsability')}
        </button>
        <div class="tab-dropdown" id="breakdownDropdown">
          <button class="tab-btn tab-dropdown-btn" id="breakdownTrigger">
           

            <svg style="width:14px;height:14px;flex-shrink:0" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M8.99901 18.7285C8.63963 18.7285 8.28221 18.6304 7.9619 18.4356C7.35936 18.0698 6.99999 17.4307 6.99999 16.7261V10.4902C6.99999 10.3042 6.93163 10.1265 6.80761 9.98878L2.62792 5.34521C2.08983 4.75488 1.95409 3.92871 2.27929 3.19287C2.60351 2.45703 3.30468 2 4.10937 2H15.8906C16.6953 2 17.3965 2.45703 17.7207 3.19287C18.0459 3.92871 17.9102 4.75488 17.3682 5.34863L13.1924 9.98877C13.0684 10.1265 13 10.3042 13 10.4902V15.5356C13 16.3794 12.5352 17.1445 11.7871 17.5327L9.92188 18.501C9.62989 18.6528 9.31346 18.7285 8.99901 18.7285ZM4.10937 3.5C3.81445 3.5 3.6914 3.7085 3.65136 3.79834C3.61132 3.88818 3.54101 4.12012 3.73925 4.33789L7.92284 8.98486C8.29491 9.39843 8.49999 9.9331 8.49999 10.4902V16.7261C8.49999 16.98 8.66796 17.1094 8.74022 17.1533C8.81249 17.1978 9.00584 17.2856 9.23045 17.1699L11.0957 16.2012C11.3457 16.0718 11.5 15.8169 11.5 15.5356V10.4902C11.5 9.9331 11.7051 9.39843 12.0771 8.98486L16.2568 4.34131C16.459 4.12012 16.3887 3.88819 16.3486 3.79834C16.3086 3.70849 16.1855 3.5 15.8906 3.5H4.10937Z" fill="currentColor"/>
</svg>

            <span id="breakdownLabel">${t('reports.tabBreakdown')}</span>
            <svg class="tab-chevron" style="width:12px;height:12px;flex-shrink:0" viewBox="0 0 12 12" fill="none">
              <path d="M2 4l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <div class="tab-dropdown-menu" id="breakdownMenu">
            <button class="tab-dropdown-item" data-tab="customers">
              <svg style="width:14px;height:14px;flex-shrink:0" viewBox="0 0 20 20" fill="none"><path d="M1.75 19C1.336 19 1 18.664 1 18.25V10.472C1 9.996 1.197 9.534 1.541 9.206L3.765 7.084C4.062 6.798 4.539 6.808 4.824 7.108C5.11 7.407 5.1 7.883 4.8 8.168L2.577 10.29C2.527 10.338 2.5 10.402 2.5 10.472V18.25C2.5 18.664 2.164 19 1.75 19Z" fill="currentColor"/><path d="M4.25 19C3.836 19 3.5 18.664 3.5 18.25V11.816C3.5 11.402 3.836 11.066 4.25 11.066C4.664 11.066 5 11.402 5 11.816V18.25C5 18.664 4.664 19 4.25 19Z" fill="currentColor"/><path d="M17.75 19H15.75C15.336 19 15 18.664 15 18.25C15 17.836 15.336 17.5 15.75 17.5H17.75C18.163 17.5 18.5 17.163 18.5 16.75V10.25C18.5 9.837 18.163 9.5 17.75 9.5H15.75C15.336 9.5 15 9.164 15 8.75C15 8.336 15.336 8 15.75 8H17.75C18.99 8 20 9.01 20 10.25V16.75C20 17.99 18.99 19 17.75 19Z" fill="currentColor"/><path d="M11.478 3H10.75V1.75C10.75 1.336 10.414 1 10 1C9.586 1 9.25 1.336 9.25 1.75V3H8.522C7.132 3 6 4.01 6 5.25V16.75C6 17.99 7.132 19 8.522 19H11.478C12.868 19 14 17.99 14 16.75V5.25C14 4.01 12.868 3 11.478 3ZM12.5 16.75C12.5 17.156 12.032 17.5 11.478 17.5H8.522C7.968 17.5 7.5 17.156 7.5 16.75V5.25C7.5 4.844 7.968 4.5 8.522 4.5H11.478C12.032 4.5 12.5 4.844 12.5 5.25V16.75Z" fill="currentColor"/></svg>
              ${t('reports.tabCustomers')}
            </button>
            <button class="tab-dropdown-item" data-tab="region">
              <svg style="width:14px;height:14px;flex-shrink:0" viewBox="0 0 20 20" fill="none"><path d="M10 9.99C8.621 9.99 7.5 8.869 7.5 7.49C7.5 6.111 8.621 4.99 10 4.99C11.379 4.99 12.5 6.111 12.5 7.49C12.5 8.869 11.379 9.99 10 9.99ZM10 6.49C9.448 6.49 9 6.938 9 7.49C9 8.042 9.448 8.49 10 8.49C10.552 8.49 11 8.042 11 7.49C11 6.938 10.552 6.49 10 6.49Z" fill="currentColor"/><path d="M10 18.583C9.444 18.582 8.93 18.335 8.588 17.904C6.688 15.514 3.5 10.98 3.5 7.49C3.5 4.044 6.416 1.24 10 1.24C13.584 1.24 16.5 4.044 16.5 7.49C16.5 11.04 13.314 15.542 11.416 17.911C11.074 18.338 10.56 18.583 10 18.583ZM10 2.74C7.243 2.74 5 4.871 5 7.49C5 10.638 8.331 15.17 9.763 16.972C9.843 17.072 9.958 17.083 10.004 17.083C10.05 17.083 10.166 17.072 10.244 16.974C11.674 15.19 15 10.697 15 7.49C15 4.871 12.757 2.74 10 2.74Z" fill="currentColor"/></svg>
              ${t('reports.tabRegion')}
            </button>
            <button class="tab-dropdown-item" data-tab="vertical">
              <svg style="width:14px;height:14px;flex-shrink:0" viewBox="0 0 20 20" fill="none"><path d="M16.39 9.813C15.548 9.813 14.788 9.449 14.261 8.87C13.733 9.449 12.974 9.813 12.13 9.813C11.287 9.813 10.527 9.449 10 8.87C9.473 9.449 8.713 9.813 7.87 9.813C7.027 9.813 6.268 9.449 5.74 8.87C5.213 9.449 4.453 9.813 3.61 9.813C2.44 9.813 1.385 9.13 0.983 8.112C0.418 6.682 1.061 5.459 1.089 5.407L2.537 2.434C2.87 1.583 3.728 1 4.697 1H15.303C16.274 1 17.132 1.584 17.487 2.487L18.898 5.435C19.163 5.898 19.468 6.942 19.02 8.108C18.627 9.128 17.57 9.813 16.39 9.813ZM5 7.49C5 7.49 5 8.313 5.74 8.313C6.48 8.313 6.99 7.49 6.99 6.934C6.99 6.52 7.326 6.184 7.74 6.184C8.154 6.184 8.49 6.52 8.49 6.934C8.49 7.694 9.109 8.313 9.87 8.313C10.631 8.313 11.25 7.694 11.25 6.934C11.25 6.52 11.586 6.184 12 6.184C12.414 6.184 12.75 6.52 12.75 6.934C12.75 7.694 13.369 8.313 14.13 8.313C14.891 8.313 15.51 7.694 15.51 6.934C15.51 6.52 15.846 6.184 16.26 6.184C16.674 6.184 17.01 6.52 17.01 6.934Z" fill="currentColor"/><path d="M16.75 10.75C16.336 10.75 16 11.086 16 11.5V13H9.52C9.51 13 9.506 13.003 9.5 13.003L9.503 11.501C9.504 11.087 9.168 10.751 8.754 10.75C8.34 10.75 8.004 11.085 8.003 11.499L7.994 16.499V16.5H4.75C4.337 16.5 4 16.163 4 15.75V11.5C4 11.086 3.664 10.75 3.25 10.75C2.836 10.75 2.5 11.086 2.5 11.5V15.75C2.5 16.99 3.51 18 4.75 18H15.25C16.49 18 17.5 16.99 17.5 15.75V11.5C17.5 11.086 17.164 10.75 16.75 10.75ZM15.25 16.5H9.5L9.503 14.496C9.51 14.497 9.515 14.5 9.522 14.5H16V15.75C16 16.163 15.663 16.5 15.25 16.5Z" fill="currentColor"/></svg>
              ${t('reports.tabVertical')}
            </button>
            <button class="tab-dropdown-item" data-tab="segment">
              <svg style="width:14px;height:14px;flex-shrink:0" viewBox="0 0 20 20" fill="none"><path d="M11.864 18.804C11.313 18.804 10.761 18.597 10.341 18.182L2.708 10.715C2.258 10.275 2 9.662 2 9.033V4.354C2 3.056 3.056 2 4.354 2H9.133C9.761 2 10.351 2.244 10.795 2.687L18.366 10.235C18.774 10.638 19 11.177 19 11.751C19 12.324 18.774 12.863 18.363 13.268L13.388 18.182C12.968 18.597 12.416 18.804 11.864 18.804ZM4.354 3.5C3.883 3.5 3.5 3.883 3.5 4.354V9.033C3.5 9.261 3.594 9.483 3.757 9.643L11.393 17.112C11.654 17.371 12.075 17.37 12.333 17.115L17.31 12.201C17.433 12.08 17.5 11.92 17.5 11.751C17.5 11.581 17.433 11.421 17.311 11.3L9.735 3.749C9.576 3.591 9.357 3.5 9.133 3.5H4.354Z" fill="currentColor"/><path d="M6 7C6.552 7 7 6.552 7 6C7 5.448 6.552 5 6 5C5.448 5 5 5.448 5 6C5 6.552 5.448 7 6 7Z" fill="currentColor"/></svg>
              ${t('reports.tabSegment')}
            </button>
            <button class="tab-dropdown-item" data-tab="country">
              <svg style="width:14px;height:14px;flex-shrink:0" viewBox="0 0 20 20" fill="none"><path d="M10 1.252C5.175 1.252 1.25 5.177 1.25 10.002C1.25 14.827 5.175 18.752 10 18.752C14.825 18.752 18.75 14.827 18.75 10.002C18.75 5.177 14.825 1.252 10 1.252ZM17.211 9.252H14.069C13.929 6.922 13.154 4.726 11.877 3.007C14.733 3.774 16.9 6.238 17.211 9.252ZM10.013 16.883C8.523 15.346 7.594 13.138 7.43 10.752H12.57C12.408 13.14 11.489 15.345 10.013 16.883ZM7.431 9.252C7.594 6.865 8.522 4.658 10.012 3.12C11.489 4.658 12.408 6.863 12.57 9.252H7.431ZM8.146 3.001C6.856 4.721 6.072 6.92 5.931 9.252H2.789C3.101 6.23 5.279 3.761 8.146 3.001ZM2.789 10.752H5.931C6.072 13.083 6.857 15.282 8.147 17.003C5.28 16.243 3.101 13.774 2.789 10.752ZM11.877 16.997C13.154 15.278 13.929 13.082 14.069 10.752H17.211C16.9 13.766 14.732 16.23 11.877 16.997Z" fill="currentColor"/></svg>
              ${t('reports.tabCountry')}
            </button>
          </div>
        </div>
        <button class="tab-btn" data-tab="metadata">
        <svg style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M11.75 10.7481C9.47363 10.7481 7.62207 8.80176 7.62207 6.40918C7.62207 4.0166 9.47363 2.07031 11.75 2.07031C14.0264 2.07031 15.8779 4.0166 15.8779 6.40918C15.8779 8.80176 14.0264 10.7481 11.75 10.7481ZM11.75 3.57032C10.3008 3.57032 9.12207 4.84376 9.12207 6.40919C9.12207 7.97462 10.3008 9.24806 11.75 9.24806C13.1992 9.24806 14.3779 7.97462 14.3779 6.40919C14.3779 4.84376 13.1992 3.57032 11.75 3.57032Z" fill="currentColor"/>
          <path d="M5.57715 16.998C5.54981 16.998 5.52246 16.9971 5.49512 16.9941C5.08399 16.9492 4.78614 16.5791 4.83008 16.167C5.13281 13.3789 8.08496 11.2764 11.6982 11.2764C12.1123 11.2764 12.4482 11.6123 12.4482 12.0264C12.4482 12.4404 12.1123 12.7764 11.6982 12.7764C8.89941 12.7764 6.53808 14.3369 6.32226 16.3291C6.28027 16.7129 5.95508 16.998 5.57715 16.998Z" fill="currentColor"/>
          <path d="M5.87793 8.99805C5.77441 8.99805 5.66992 8.97657 5.57031 8.93164C4.04883 8.24805 3.06543 6.68164 3.06543 4.94141C3.06543 2.54883 4.91699 0.602539 7.19336 0.602539C7.43652 0.602539 7.67676 0.624999 7.90918 0.666989C8.31738 0.741209 8.58789 1.13086 8.51465 1.53808C8.44141 1.94628 8.05078 2.21581 7.64356 2.14355C7.49708 2.11718 7.34668 2.10253 7.19336 2.10253C5.74414 2.10253 4.56543 3.37597 4.56543 4.9414C4.56543 6.09179 5.20117 7.12109 6.18555 7.56445C6.56348 7.7334 6.73145 8.17773 6.56153 8.55566C6.43653 8.83398 6.16406 8.99805 5.87793 8.99805Z" fill="currentColor"/>
          <path d="M1.07129 15.4981C1.04395 15.4981 1.0166 15.4971 0.989259 15.4941C0.577149 15.4492 0.280279 15.0791 0.324219 14.667C0.615239 11.9922 3.33106 9.93848 6.7832 9.78516C7.15918 9.73731 7.54687 10.0869 7.56543 10.501C7.58399 10.915 7.26367 11.2646 6.84961 11.2832C4.18652 11.4023 2.02246 12.9268 1.81641 14.8291C1.77442 15.2129 1.44922 15.4981 1.07129 15.4981Z" fill="currentColor"/>
          <path d="M19 14.998C19 14.4475 18.5549 14.0018 18.0049 13.999V13.0078C18.0049 11.8994 17.1035 10.998 15.9951 10.998C14.8877 10.998 13.9863 11.8994 13.9863 13.0078V14.0007C13.4407 14.0085 13 14.4507 13 14.998V17.998C13 18.2186 13.0857 18.4119 13.2065 18.5771C13.2822 18.6807 13.3735 18.7653 13.4827 18.8332C13.6359 18.9285 13.8064 18.998 14 18.998H18C18.1936 18.998 18.3641 18.9285 18.5173 18.8332C18.6264 18.7653 18.7178 18.6807 18.7934 18.5771C18.9143 18.4119 19 18.2186 19 17.998L19 14.998ZM15.9951 12.248C16.4141 12.248 16.7549 12.5889 16.7549 13.0078V13.998H15.2363V13.0078C15.2363 12.5889 15.5772 12.248 15.9951 12.248Z" fill="currentColor"/>
        </svg>  
        ${t('reports.tabMetadata')}
        </button>
        <button class="tab-btn" data-tab="compare">
          <svg style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M8.25 18.0215H7.25C6.00977 18.0215 5 17.0117 5 15.7715V7.27148C5 6.03125 6.00977 5.02148 7.25 5.02148H15.75C16.9902 5.02148 18 6.03125 18 7.27148V8.25C18 8.66406 17.6641 9 17.25 9C16.8359 9 16.5 8.66406 16.5 8.25V7.27148C16.5 6.85839 16.1631 6.52148 15.75 6.52148H7.25C6.83691 6.52148 6.5 6.85839 6.5 7.27148V15.7715C6.5 16.1846 6.83691 16.5215 7.25 16.5215H8.25C8.66406 16.5215 9 16.8574 9 17.2715C9 17.6855 8.66406 18.0215 8.25 18.0215Z" fill="currentColor"/>
            <path d="M2.75 13.7715C2.33594 13.7715 2 13.4355 2 13.0215V4.27148C2 3.03125 3.00977 2.02148 4.25 2.02148H13C13.4141 2.02148 13.75 2.35742 13.75 2.77148C13.75 3.18554 13.4141 3.52148 13 3.52148H4.25C3.83691 3.52148 3.5 3.85839 3.5 4.27148V13.0215C3.5 13.4355 3.16406 13.7715 2.75 13.7715Z" fill="currentColor"/>
            <path d="M19.4307 18.3701L16.8394 15.7788C17.309 15.1023 17.5879 14.2843 17.5879 13.4004C17.5879 11.0918 15.709 9.21289 13.4004 9.21289C11.0918 9.21289 9.21289 11.0918 9.21289 13.4004C9.21289 15.709 11.0918 17.5879 13.4004 17.5879C14.2843 17.5879 15.1023 17.309 15.7788 16.8394L18.3701 19.4307C18.5166 19.5771 18.708 19.6504 18.9004 19.6504C19.0928 19.6504 19.2842 19.5772 19.4307 19.4307C19.7236 19.1377 19.7236 18.6631 19.4307 18.3701ZM10.7129 13.4004C10.7129 11.9189 11.9189 10.7129 13.4004 10.7129C14.8818 10.7129 16.0879 11.9189 16.0879 13.4004C16.0879 14.8818 14.8818 16.0879 13.4004 16.0879C11.9189 16.0879 10.7129 14.8818 10.7129 13.4004Z" fill="currentColor"/>
          </svg>
          ${t('reports.tabCompare')}
        </button>
        <button class="tab-btn" data-tab="timeline">
          <svg  style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M2.99952 17.75C2.84473 17.75 2.68848 17.7021 2.5547 17.6035C2.2212 17.3574 2.1504 16.8877 2.3965 16.5547L4.69386 13.4414C4.93214 13.1191 5.38331 13.0391 5.71632 13.2646L7.76515 14.6436L9.38722 7.65918C9.45656 7.36035 9.7007 7.13477 10.0039 7.08789C10.3081 7.03906 10.6079 7.18457 10.7637 7.44824L12.6958 10.7246L16.3164 2.69141C16.4863 2.31348 16.9302 2.14649 17.3081 2.31641C17.6856 2.48633 17.854 2.93067 17.6836 3.3086L13.4688 12.6611C13.354 12.916 13.106 13.0859 12.8262 13.1016C12.5498 13.1309 12.2813 12.9746 12.1392 12.7334L10.4243 9.82521L8.98001 16.044C8.92435 16.2842 8.75394 16.4815 8.52444 16.5723C8.29495 16.6611 8.03567 16.6348 7.83059 16.4961L5.47463 14.9102L3.60354 17.4453C3.45657 17.6445 3.2295 17.75 2.99952 17.75Z" fill="currentColor"/>
          </svg>
          ${t('reports.tabTimeline')}
        </button>
      </div>

      <div id="reportContent">
        <div class="flex items-center gap-8" style="color:var(--gray-400);font-size:13px">
          <div class="loading-spinner"></div> ${t('reports.loading')}
        </div>
      </div>`;

    // ── Wire tab clicks ───────────────────────────────────────────────────────
    const _breakdownTabs = new Set(['customers', 'region', 'vertical', 'segment', 'country']);

    // Helper: activate a breakdown sub-tab
    function _activateBreakdown(tab) {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-dropdown-item').forEach(i => i.classList.remove('active'));
      const trigger = document.getElementById('breakdownTrigger');
      trigger.classList.add('active');
      // Mark active item in menu
      const item = document.querySelector(`.tab-dropdown-item[data-tab="${tab}"]`);
      if (item) {
        item.classList.add('active');
        document.getElementById('breakdownLabel').textContent = item.textContent.trim();
      }
      // Close menu
      document.getElementById('breakdownMenu').classList.remove('open');
      trigger.classList.remove('menu-open');
    }

    document.getElementById('reportTabs').onclick = e => {
      // Dropdown item click
      const item = e.target.closest('.tab-dropdown-item');
      if (item) {
        _activateBreakdown(item.dataset.tab);
        loadTab(item.dataset.tab);
        return;
      }
      // Breakdown trigger toggle
      const trigger = e.target.closest('#breakdownTrigger');
      if (trigger) {
        const menu = document.getElementById('breakdownMenu');
        const isOpen = menu.classList.contains('open');
        menu.classList.toggle('open', !isOpen);
        trigger.classList.toggle('menu-open', !isOpen);
        return;
      }
      // Regular tab button
      const btn = e.target.closest('.tab-btn');
      if (!btn) return;
      // Close breakdown menu if open
      document.getElementById('breakdownMenu').classList.remove('open');
      document.getElementById('breakdownTrigger').classList.remove('menu-open');
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-dropdown-item').forEach(i => i.classList.remove('active'));
      document.getElementById('breakdownLabel').textContent = t('reports.tabBreakdown');
      btn.classList.add('active');
      loadTab(btn.dataset.tab);
    };

    // Close dropdown when clicking outside
    document.addEventListener('click', function _closeBreakdown(e) {
      if (!document.getElementById('breakdownDropdown')?.contains(e.target)) {
        document.getElementById('breakdownMenu')?.classList.remove('open');
        document.getElementById('breakdownTrigger')?.classList.remove('menu-open');
      }
    }, true);

    // ── Wire period change ────────────────────────────────────────────────────
    document.getElementById('reportPeriod').onchange = () => {
      const active = document.querySelector('.tab-btn.active');
      if (active) loadTab(active.dataset.tab);
    };

    // ── Load customers for picker ─────────────────────────────────────────────
    try {
      const cr = await API.customers.list({ limit: 200 });
      _allCustomers = (cr.data || []).sort((a, b) =>
        (a.display_name || '').localeCompare(b.display_name || '')
      );
      const custSel = document.getElementById('reportCustomer');
      if (custSel) {
        _allCustomers.forEach(cu => {
          const o = document.createElement('option');
          o.value = cu.id;
          o.textContent = cu.display_name;
          custSel.appendChild(o);
        });
        if (typeof SearchableSelect !== 'undefined') {
          _ssCust = new SearchableSelect(custSel, { placeholder: 'Search customers…' });
        }
      }
    } catch {}

    // ── Customer select handler ───────────────────────────────────────────────
    document.getElementById('reportCustomer').onchange = async function() {
      const custId = parseInt(this.value) || 0;
      _filter = custId ? { customerId: custId } : {};

      // Reset HC select
      const hcSel = document.getElementById('reportHealthCheck');
      hcSel.innerHTML = `<option value="">${t('reports.allHealthChecks')}</option>`;

      if (custId) {
        // Load health checks for this customer
        try {
          const hcRes = await API.healthChecks.list({ customer_id: custId, limit: 200 });
          const hcs   = (hcRes.data || []).sort((a, b) =>
            new Date(b.created_at) - new Date(a.created_at)
          );
          hcs.forEach(hc => {
            const o = document.createElement('option');
            o.value = hc.id;
            o.textContent = hc.name || `HC #${hc.id}`;
            hcSel.appendChild(o);
          });
          // Create or show the SearchableSelect for the HC picker
          if (typeof SearchableSelect !== 'undefined') {
            if (_ssHc) {
              _ssHc.show();
            } else {
              _ssHc = new SearchableSelect(hcSel, { placeholder: 'Search health checks…' });
            }
          } else {
            hcSel.style.display = '';
          }
        } catch {
          if (_ssHc) _ssHc.hide(); else hcSel.style.display = 'none';
        }
      } else {
        if (_ssHc) _ssHc.hide(); else hcSel.style.display = 'none';
      }

      _updateFilterChip();
      const active = document.querySelector('.tab-btn.active');
      if (active) loadTab(active.dataset.tab);
    };

    // ── Health-check select handler ───────────────────────────────────────────
    document.getElementById('reportHealthCheck').onchange = function() {
      const hcId = parseInt(this.value) || 0;
      if (hcId) {
        _filter = { customerId: _filter.customerId, healthCheckId: hcId };
      } else {
        _filter = _filter.customerId ? { customerId: _filter.customerId } : {};
      }
      _updateFilterChip();
      const active = document.querySelector('.tab-btn.active');
      if (active) loadTab(active.dataset.tab);
    };

    // Activate the requested tab (default: overview)
    if (_initialTab !== 'overview') {
      if (_breakdownTabs.has(_initialTab)) {
        _activateBreakdown(_initialTab);
      } else {
        const targetBtn = document.querySelector(`.tab-btn[data-tab="${_initialTab}"]`);
        if (targetBtn) {
          document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
          targetBtn.classList.add('active');
        }
      }
    }
    loadTab(_initialTab);
  }

  // ── Filter chip ──────────────────────────────────────────────────────────────
  function _clearFilter() {
    _filter = {};
    const custSel = document.getElementById('reportCustomer');
    const hcSel   = document.getElementById('reportHealthCheck');
    if (custSel) { if (_ssCust) _ssCust.setValue(''); else custSel.value = ''; }
    if (hcSel)   {
      hcSel.innerHTML = `<option value="">${t('reports.allHealthChecks')}</option>`;
      if (_ssHc) { _ssHc.hide(); _ssHc = null; } else hcSel.style.display = 'none';
    }
    _updateFilterChip();
    const active = document.querySelector('.tab-btn.active');
    if (active) loadTab(active.dataset.tab);
  }

  function _updateFilterChip() {
    const chip = document.getElementById('reportFilterChip');
    if (!chip) return;

    if (!_filter.customerId && !_filter.healthCheckId) {
      chip.style.display = 'none';
      chip.innerHTML     = '';
      return;
    }

    const cust = _allCustomers.find(c => c.id == _filter.customerId);
    const custName = cust ? cust.display_name : `Customer #${_filter.customerId}`;
    const hcSel  = document.getElementById('reportHealthCheck');
    const hcName = _filter.healthCheckId && hcSel
      ? (hcSel.options[hcSel.selectedIndex]?.text || `HC #${_filter.healthCheckId}`)
      : null;

    const label = hcName ? `${custName} › ${hcName}` : custName;

    chip.style.display = 'flex';
    chip.innerHTML = `
      <span style="display:inline-flex;align-items:center;gap:6px;padding:3px 10px 3px 8px;
                   border-radius:20px;background:var(--accent-light);border:1px solid var(--accent);
                   font-size:12px;font-weight:500;color:var(--accent)">
        <svg viewBox="0 0 14 14" fill="none" style="width:11px;height:11px;flex-shrink:0">
          <path d="M1 3h12M3.5 7h7M6 11h2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        ${escHtml(label)}
        <button class="chip-clear-btn"
                style="margin-left:2px;border:none;background:none;cursor:pointer;color:var(--accent);
                       font-size:14px;line-height:1;padding:0 2px" title="Clear filter">×</button>
      </span>
      <span style="font-size:11px;color:var(--gray-400);align-self:center">
        ${t('reports.filteringScopeNote')}
      </span>`;

    // Wire close button directly — no inline onclick needed
    chip.querySelector('.chip-clear-btn').addEventListener('click', _clearFilter);
  }

  function loadingState() {
    return `<div class="flex items-center gap-8" style="color:var(--gray-400);font-size:13px"><div class="loading-spinner"></div> ${t('common.loading')}</div>`;
  }

  async function loadTab(tab) {
    const c = document.getElementById('reportContent');
    c.innerHTML = loadingState();
    try {
      switch (tab) {
        case 'overview':     await renderOverview(c, _filter);          break;
        case 'security':     await renderSecurity(c, null, _filter);    break;
        case 'accessibility':await renderAccessibility(c, _filter);     break;
        case 'usability':    await renderUsability(c, _filter);         break;
        case 'customers':    await renderByCustomer(c, _filter);        break;
        case 'region':       await renderByDim(c, 'region',   _filter); break;
        case 'vertical':     await renderByDim(c, 'vertical', _filter); break;
        case 'segment':      await renderByDim(c, 'segment',  _filter); break;
        case 'country':      await renderByDim(c, 'country',  _filter); break;
        case 'metadata':     await renderMetadata(c, _filter);          break;
        case 'compare':      await renderCompare(c);                     break;
        case 'timeline':     await renderTimeline(c, _filter);           break;
      }
    } catch (e) {
      c.innerHTML = `<div class="connection-banner">${e.message}</div>`;
    }
  }

  // ── Overview ─────────────────────────────────────────────────────────────────
  async function renderOverview(c, filter = {}) {
    const ovRes = await API.stats.overview(filter);
    const ov    = ovRes.data || {};
    if (!ov.total_health_checks) { _noDataCard(c); return; }
    c.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-bottom:24px">
        <div class="card" style="text-align:center">
          <div class="stat-label" style="margin-bottom:8px">${t('reports.avgPdfScore')}</div>
          <div style="display:flex;justify-content:center"><div id="ovScoreDonut"></div></div>
          <div class="stat-sub" style="margin-top:8px">${t('reports.acrossAll')}</div>
        </div>
        <div class="card">
          <div class="stat-label" style="margin-bottom:12px">${t('reports.scoreBreakdown')}</div>
          <div style="display:flex;flex-direction:column;gap:10px">
            ${scoreBar(t('reports.goodRange'), ov.score_good || 0, ov.total_pdfs || 1, 'var(--green)')}
            ${scoreBar(t('reports.fairRange'), ov.score_fair || 0, ov.total_pdfs || 1, 'var(--yellow)')}
            ${scoreBar(t('reports.poorRange'), ov.score_poor || 0, ov.total_pdfs || 1, 'var(--red)')}
          </div>
        </div>
        <div class="card">
          <div class="stat-label" style="margin-bottom:12px">${t('reports.pdfProperties')}</div>
          <div style="display:flex;flex-direction:column;gap:10px">
            ${scoreBar(t('reports.taggedPdfs'), ov.tagged_pdfs || 0, ov.total_pdfs || 1, 'var(--accent)')}
            ${scoreBar(t('reports.versionOk'), ov.pdf_version_compliant || 0, ov.total_pdfs || 1, 'var(--green)')}
            ${scoreBar(t('reports.linearized'), ov.linearized_pdfs || 0, ov.total_pdfs || 1, 'var(--purple)')}
            ${scoreBar(t('reports.encrypted'), ov.encrypted_pdfs || 0, ov.total_pdfs || 1, 'var(--yellow)')}
            ${scoreBar(t('reports.hasXfa'), ov.xfa_pdfs || 0, ov.total_pdfs || 1, 'var(--red)')}
          </div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
        <div class="card">
          <div class="section-title"><span>${t('reports.scoreTrend30')}</span></div>
          <div id="trendChartRep" style="margin-top:12px"></div>
        </div>
        <div class="card">
          <div class="section-title"><span>${t('reports.complianceRates')}</span></div>
          <div id="dimScoreChart" style="margin-top:12px"></div>
        </div>
      </div>`;

    // ── Overview score donut — Spectrum style matching dashboard dimension rings
    const ovScore = Math.round(ov.avg_score || 0);
    const ovCol   = ovScore >= 75 ? 'var(--green)' : ovScore >= 50 ? 'var(--yellow)' : 'var(--red)';
    Charts.donut(document.getElementById('ovScoreDonut'), {
      segments: [
        { value: ovScore,       color: ovCol },
        { value: 100 - ovScore, color: 'var(--gray-200)' },
      ],
      size:     120,
      label:    `${ovScore}`,
      sublabel: scoreLabel(ovScore),
    });

    const trendRes = await API.stats.trend(30, filter);
    const trend    = trendRes.data || {};
    // Spectrum: score trend rendered as area chart (fill-opacity 0.8, 2 px stroke)
    Charts.vbar(document.getElementById('trendChartRep'), {
      labels:   trend.labels || [],
      datasets: [{ label: 'Avg Score', data: trend.scores || [], color: Charts.CAT[5] }],
      height:   190,
      type:     'area'
    });
    // Compliance rates — Spectrum categorical palette, one colour per dimension
    const total = ov.total_pdfs || 1;
    Charts.hbar(document.getElementById('dimScoreChart'), {
      items: [
        { label: t('dashboard.tagged'),            value: Math.round((ov.tagged_pdfs           || 0) / total * 100), color: Charts.CAT[5] },
        { label: t('dashboard.versionOkShort'),    value: Math.round((ov.pdf_version_compliant || 0) / total * 100), color: Charts.CAT[0] },
        { label: t('dashboard.noXfa'),             value: Math.round(((total-(ov.xfa_pdfs||0)) / total) * 100),      color: Charts.CAT[2] },
        { label: t('dashboard.unencryptedShort'),  value: Math.round(((total-(ov.encrypted_pdfs||0)) / total) * 100), color: Charts.CAT[1] },
        { label: t('dashboard.linearizedShort'),   value: Math.round((ov.linearized_pdfs       || 0) / total * 100), color: Charts.CAT[6] },
      ],
      max: 100
    });
  }

  // ── Security ──────────────────────────────────────────────────────────────────
  async function renderSecurity(c, highlightFilter = null, filter = {}) {
    const [res, trendRes] = await Promise.all([
      API.stats.security(filter),
      API.stats.trend(30, filter).catch(() => ({ data: {} }))
    ]);
    const d   = res.data || {};
    const tot = d.totals || {};
    const total = (int(tot.total)) || 1;
    const tr  = trendRes.data || {};
    if (!int(tot.total)) { _noDataCard(c); return; }

    const severityColor = { high: 'var(--red)',    medium: 'var(--yellow)', low: 'var(--purple)' };
    const severityBg    = { high: 'var(--red-light)', medium: 'var(--yellow-light)', low: 'var(--purple-light)' };

    c.innerHTML = `
      <!-- Stat cards — Spectrum categorical palette -->
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:20px">
        ${secStatCard(t('reports.secTotalPdfs'),    int(tot.total),       null,  'rgb(20,122,243)',  tr.pdfs,      t('reports.secSparkPdfs'))}
        ${secStatCard(t('reports.secUntagged'),     int(tot.untagged),   total, 'var(--red)',       tr.untagged,  t('reports.secSparkUntagged'))}
        ${secStatCard(t('reports.secEncrypted'),    int(tot.encrypted),   total, 'rgb(246,133,17)',  tr.encrypted, t('reports.secSparkEncrypted'))}
        ${secStatCard(t('reports.secXfa'),          int(tot.has_xfa),         total, 'rgb(222,61,130)',  tr.xfa,       t('reports.secSparkXfa'))}
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:20px">
        ${secStatCard(t('reports.secPiiAuthor'),    int(tot.pii_author),      total, 'rgb(246,133,17)')}
        ${secStatCard(t('reports.secEmbedded'),     int(tot.has_embedded_files), total, 'rgb(64,70,202)')}
        ${secStatCard(t('reports.secCopyRestricted'), int(tot.copy_restricted), total, 'rgb(222,61,130)')}
        ${secStatCard(t('reports.secAvgVersion'),   (tot.avg_version || '—') + '', null, 'rgb(115,38,211)')}
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:20px">
        ${secStatCard(t('reports.secAtBlocked'),      int(tot.assistive_tech_blocked), total, 'var(--red)')}
        ${secStatCard(t('reports.secFormFillBlocked'), int(tot.form_filling_blocked),  total, 'rgb(246,133,17)')}
        ${secStatCard(t('reports.secCommentBlocked'),  int(tot.commenting_blocked),    total, 'rgb(64,70,202)')}
        ${secStatCard(t('reports.secPrintBlocked'),    int(tot.printing_blocked),      total, 'rgb(115,38,211)')}
      </div>

      <!-- Charts row -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px">
        <div class="card">
          <div class="section-title"><span>${t('reports.versionDist')}</span></div>
          <div id="versionChart" style="margin-top:12px"></div>
        </div>
        <div class="card">
          <div class="section-title"><span>${t('reports.propCompliance')}</span></div>
          <div id="secComplianceChart" style="margin-top:12px"></div>
        </div>
      </div>

      <!-- Issues table with drill-down -->
      <div class="card card-table">
        <div class="section-title"><span>${t('reports.secIssues')}</span></div>
        <div class="table-wrap"><table>
          <thead><tr>
            <th>${t('reports.thIssue')}</th><th>${t('reports.thSeverity')}</th><th style="text-align:right">${t('reports.thAffected')}</th>
            <th style="text-align:right">${t('reports.thRate')}</th><th style="width:180px">${t('reports.thDistribution')}</th><th></th>
          </tr></thead>
          <tbody>
            ${(d.issues || []).map(iss => `
              <tr class="sec-issue-row ${highlightFilter === iss.key ? 'row-active' : ''}"
                  style="cursor:pointer"
                  data-key="${escHtml(iss.key)}" data-label="${escHtml(iss.label)}">
                <td class="font-medium" style="font-size:13px">${escHtml(iss.label)}</td>
                <td><span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:20px;
                    color:${severityColor[iss.severity]};background:${severityBg[iss.severity]}">
                  ${ucFirst(iss.severity)}
                </span></td>
                <td style="text-align:right;font-weight:600;color:${iss.count > 0 ? 'var(--red)' : 'var(--green)'}">${iss.count}</td>
                <td style="text-align:right;color:var(--gray-500);font-size:13px">${iss.pct}%</td>
                <td><div class="progress-bar" style="height:6px">
                  <div class="progress-fill" style="width:${iss.pct}%;background:${iss.pct > 30 ? 'var(--red)' : iss.pct > 10 ? 'var(--yellow)' : 'var(--green)'}"></div>
                </div></td>
                <td><span style="font-size:12px;color:var(--accent)">${t('common.viewArrow')}</span></td>
              </tr>`).join('')}
          </tbody>
        </table></div>
      </div>

      <!-- Drill-down area -->
      <div id="secDrilldown" style="margin-top:20px"></div>`;

    // Version distribution — colour-coded by compliance level using Spectrum palette
    Charts.hbar(document.getElementById('versionChart'), {
      items: (d.versions || []).map(v => ({
        label: 'PDF ' + v.version,
        value: v.count,
        color: parseFloat(v.version) >= 1.7 ? Charts.CAT[0]  // teal  — fully compliant
             : parseFloat(v.version) >= 1.4 ? Charts.CAT[5]  // blue  — partially compliant
             :                                Charts.CAT[3]   // magenta — old / non-compliant
      })),
      max: total
    });

    // Property compliance — Spectrum categorical, one colour per dimension
    Charts.hbar(document.getElementById('secComplianceChart'), {
      items: [
        { label: t('dashboard.unencryptedShort'),   value: Math.round((int(tot.total) - int(tot.encrypted))               / total * 100), color: Charts.CAT[0] },
        { label: t('dashboard.noXfa'),              value: Math.round((int(tot.total) - int(tot.has_xfa))                  / total * 100), color: Charts.CAT[2] },
        { label: t('reports.secNoPii'),             value: Math.round((int(tot.total) - int(tot.pii_author||0))            / total * 100), color: Charts.CAT[1] },
        { label: t('reports.secNoEmbedded'),        value: Math.round((int(tot.total) - int(tot.has_embedded_files||0))    / total * 100), color: Charts.CAT[5] },
        { label: t('dashboard.versionOk'),          value: Math.round((int(tot.total) - int(tot.old_version))              / total * 100), color: Charts.CAT[6] },
        { label: t('dashboard.screenReaderOk'),     value: Math.round((int(tot.total) - int(tot.assistive_tech_blocked||0))/ total * 100), color: Charts.CAT[3] },
        { label: t('dashboard.copyOk'),             value: Math.round((int(tot.total) - int(tot.copy_restricted||0))       / total * 100), color: Charts.CAT[4] },
      ],
      max: 100
    });

    // Wire up issue row clicks via event listeners (avoids HTML-attribute quoting issues)
    document.querySelectorAll('.sec-issue-row').forEach(row => {
      row.addEventListener('click', () => {
        window.ReportsView.drillSecurity(row.dataset.key, row.dataset.label);
      });
    });

    if (highlightFilter) showSecurityDrilldown(highlightFilter);
  }

  // Drill-down: inline below the issues table
  window.ReportsView = window.ReportsView || {};
  window.ReportsView.drillSecurity = async function(filter, label) {
    const panel = document.getElementById('secDrilldown');
    if (!panel) return;
    panel.innerHTML = `<div class="card"><div class="section-title"><span>Loading "${label}"…</span></div>${loadingState()}</div>`;
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    // Highlight the active row
    document.querySelectorAll('.sec-issue-row').forEach(r => {
      r.classList.toggle('row-active', r.dataset.key === filter);
    });

    try {
      const res  = await API.stats.securityDrilldown(filter, _filter);
      const docs = res.data || [];

      if (!docs.length) {
        panel.innerHTML = `<div class="card"><div class="section-title"><span>${escHtml(label)}</span></div>
          <div class="empty-state" style="padding:20px"><h3>${t('reports.noDocsFound')}</h3><p>${t('reports.noDocsPii')}</p></div>
        </div>`;
        return;
      }

      panel.innerHTML = `
        <div class="card card-table">
          <div class="section-title">
            <span>${escHtml(label)} <span style="font-size:12px;font-weight:400;color:var(--gray-400)">${t('reports.drillDoc', { count: docs.length, s: docs.length !== 1 ? 's' : '' })}</span></span>
            <button class="btn btn-ghost btn-sm" onclick="document.getElementById('secDrilldown').innerHTML=''">${t('reports.drillClose')}</button>
          </div>
          <div class="table-wrap"><table>
            <thead><tr>
              <th>${t('reports.thFile')}</th><th>${t('reports.thCustomer')}</th><th>${t('reports.thHc')}</th>
              <th>${t('reports.thPdfVersion')}</th><th>${t('reports.thTagged')}</th><th>${t('reports.thEncrypted')}</th><th>${t('reports.thXfa')}</th><th>${t('reports.thScore')}</th>
            </tr></thead>
            <tbody>
              ${docs.map(doc => `
                <tr style="cursor:pointer" onclick="App.navigate('healthchecks',{id:${doc.hc_id}})">
                  <td>
                    <div style="display:flex;align-items:center;gap:6px">
                      <div class="file-icon" style="width:24px;height:24px;border-radius:4px;flex-shrink:0">
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M16.3413 5.28027L12.7192 1.65918C12.2944 1.23438 11.7295 1 11.1289 1H5.25C4.00928 1 3 2.00977 3 3.25V15.75C3 16.9902 4.00928 18 5.25 18H14.75C15.9907 18 17 16.9902 17 15.75V6.87109C17 6.27929 16.7603 5.69921 16.3413 5.28027ZM15.2803 6.34082C15.3259 6.38647 15.3541 6.44458 15.3863 6.5H12.25C11.8364 6.5 11.5 6.16309 11.5 5.75V2.61401C11.5552 2.64624 11.6132 2.67419 11.6587 2.71972L15.2803 6.34082ZM14.75 16.5H5.25C4.83643 16.5 4.5 16.1631 4.5 15.75V3.25C4.5 2.83691 4.83643 2.5 5.25 2.5H10V5.75C10 6.99023 11.0093 8 12.25 8H15.5V15.75C15.5 16.1631 15.1636 16.5 14.75 16.5Z" fill="currentColor"/>
</svg>

                      </div>
                      <span style="font-size:12px;font-weight:500;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(doc.filename)}</span>
                    </div>
                  </td>
                  <td class="text-sm text-muted">${escHtml(doc.customer_name)}</td>
                  <td class="text-sm">${escHtml(doc.hc_name)}</td>
                  <td class="text-sm">${doc.pdf_version ? 'PDF '+doc.pdf_version : '—'}</td>
                  <td>${boolIcon(doc.is_tagged)}</td>
                  <td>${boolIcon(!doc.is_encrypted, true)}</td>
                  <td>${boolIcon(!doc.has_xfa, true)}</td>
                  <td>${doc.overall_score != null ? `<span class="score-pill ${doc.overall_score>=75?'good':doc.overall_score>=50?'warn':'poor'}">${doc.overall_score}</span>` : '—'}</td>
                </tr>`).join('')}
            </tbody>
          </table></div>
        </div>`;
    } catch (e) {
      panel.innerHTML = `<div class="connection-banner">${e.message}</div>`;
    }
  };

  async function showSecurityDrilldown(filter) {
    window.ReportsView.drillSecurity(filter, filter);
  }

  // ── Accessibility ─────────────────────────────────────────────────────────────
  async function renderAccessibility(c, filter = {}) {
    const res = await API.stats.accessibility(filter);
    const d   = res.data || {};
    console.log('[Accessibility debug]', d._debug, 'checks returned:', (d.checks||[]).length, 'legacy_only:', d.legacy_only);
    const tot = d.totals     || {};
    const checks      = d.checks      || [];
    const worst       = d.worst_docs  || [];
    const legacyOnly  = !!d.legacy_only;
    const totalChecked = (int(tot.total_passed) + int(tot.total_failed) + int(tot.total_warnings)) || 1;
    if (!int(tot.total_passed) && !int(tot.total_failed) && !int(tot.total_warnings)) { _noDataCard(c); return; }

    c.innerHTML = `
      <!-- Headline stats — Spectrum categorical colours -->
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:20px">
        ${accStatCard(t('reports.accAvgPassRate'), (tot.avg_pass_rate ?? '—') + '%', 'rgb(20,122,243)')}
        ${accStatCard(t('reports.accTotalChecks'), fmtNum(int(tot.total_passed)+int(tot.total_failed)+int(tot.total_warnings)), 'rgb(64,70,202)')}
        ${accStatCard(t('reports.accPassed'), fmtNum(int(tot.total_passed)), 'rgb(15,181,174)')}
        ${accStatCard(t('reports.accFailed'), fmtNum(int(tot.total_failed)), int(tot.total_failed) > 0 ? 'var(--red)' : 'var(--green)')}
      </div>
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:16px;margin-bottom:20px">
        ${accStatCard(t('reports.accNoFailures'), int(tot.fully_passing) + ' / ' + int(tot.total_docs), 'rgb(15,181,174)')}
        ${accStatCard(t('reports.accWarnings'), fmtNum(int(tot.total_warnings)), 'rgb(246,133,17)')}
      </div>

      <!-- Check breakdown + worst performers -->
      <div style="display:grid;grid-template-columns:3fr 2fr;gap:20px;align-items:start">

        <!-- Per-named-check table -->
        <div class="card card-table" style="min-width:0">
          <div class="section-title"><span>${t('reports.checksBreakdown')}</span></div>
          ${checks.length ? `
          <div class="table-wrap" style="max-height:520px;overflow-y:auto">
            <table>
              <thead><tr>
                <th>${t('reports.accThCheck')}</th>
                <th style="text-align:right">${t('reports.accThPassed')}</th>
                <th style="text-align:right">${t('reports.accThFailed')}</th>
                <th style="text-align:right">${t('reports.accThWarnings')}</th>
                <th style="width:120px">${t('reports.accThPassRate')}</th>
                <th></th>
              </tr></thead>
              <tbody>
                ${checks.map(ch => {
                  const hasIssue = ch.failed > 0 || ch.warnings > 0;
                  return `
                  <tr class="acc-check-row" style="cursor:pointer"
                      data-check="${escHtml(ch.name)}">
                    <td>
                      <div style="display:flex;align-items:center;gap:6px">
                        ${ch.failed > 0
                          ? `<span style="width:6px;height:6px;border-radius:50%;background:var(--red);flex-shrink:0;display:inline-block"></span>`
                          : ch.warnings > 0
                          ? `<span style="width:6px;height:6px;border-radius:50%;background:var(--yellow);flex-shrink:0;display:inline-block"></span>`
                          : `<span style="width:6px;height:6px;border-radius:50%;background:var(--green);flex-shrink:0;display:inline-block"></span>`}
                        <span style="font-size:12.5px;font-weight:${ch.failed > 0 ? '600' : '400'}">${escHtml(ch.name)}</span>
                      </div>
                    </td>
                    <td style="text-align:right;color:var(--green);font-size:12px">${ch.passed}</td>
                    <td style="text-align:right;color:${ch.failed > 0 ? 'var(--red)' : 'var(--gray-400)'};font-size:12px;font-weight:${ch.failed > 0 ? '600' : '400'}">${ch.failed}</td>
                    <td style="text-align:right;color:${ch.warnings > 0 ? 'var(--yellow)' : 'var(--gray-400)'};font-size:12px">${ch.warnings}</td>
                    <td>
                      <div style="display:flex;align-items:center;gap:6px">
                        <div class="progress-bar" style="height:5px;flex:1">
                          <div class="progress-fill" style="width:${ch.pass_rate}%;background:${ch.pass_rate>=80?'var(--green)':ch.pass_rate>=50?'var(--yellow)':'var(--red)'}"></div>
                        </div>
                        <span style="font-size:11px;color:var(--gray-500);width:28px;text-align:right">${ch.pass_rate}%</span>
                      </div>
                    </td>
                    <td><span style="font-size:12px;color:var(--accent)">→</span></td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>` : legacyOnly
            ? `<div class="empty-state" style="padding:20px"><h3>${t('reports.noCheckDataLegacy')}</h3><p>${t('reports.noCheckDataLegacySub')}</p></div>`
            : `<div class="empty-state" style="padding:20px"><h3>${t('reports.noCheckData')}</h3><p>${t('reports.noCheckDataSub')}</p></div>`}
        </div>

        <!-- Worst performing documents -->
        <div class="card" style="min-width:0">
          <div class="section-title"><span>${t('reports.mostIssues')}</span></div>
          ${worst.length ? `
          <div style="display:flex;flex-direction:column;gap:8px;max-height:520px;overflow-y:auto;padding-right:2px">
            ${worst.map(doc => {
              const total = doc.passed_checks + doc.failed_checks + doc.warning_checks || 1;
              const pct   = Math.round(doc.passed_checks / total * 100);
              return `
              <div class="worst-doc-card" onclick="App.navigate('healthchecks',{id:${doc.hc_id}})" style="cursor:pointer">
                <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:6px">
                  <div class="file-icon" style="width:28px;height:28px;border-radius:5px;flex-shrink:0">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M16.3413 5.28027L12.7192 1.65918C12.2944 1.23438 11.7295 1 11.1289 1H5.25C4.00928 1 3 2.00977 3 3.25V15.75C3 16.9902 4.00928 18 5.25 18H14.75C15.9907 18 17 16.9902 17 15.75V6.87109C17 6.27929 16.7603 5.69921 16.3413 5.28027ZM15.2803 6.34082C15.3259 6.38647 15.3541 6.44458 15.3863 6.5H12.25C11.8364 6.5 11.5 6.16309 11.5 5.75V2.61401C11.5552 2.64624 11.6132 2.67419 11.6587 2.71972L15.2803 6.34082ZM14.75 16.5H5.25C4.83643 16.5 4.5 16.1631 4.5 15.75V3.25C4.5 2.83691 4.83643 2.5 5.25 2.5H10V5.75C10 6.99023 11.0093 8 12.25 8H15.5V15.75C15.5 16.1631 15.1636 16.5 14.75 16.5Z" fill="currentColor"/>
</svg>
  
                  </div>
                  <div style="min-width:0;flex:1">
                    <div style="font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(doc.filename)}</div>
                    <div style="font-size:11px;color:var(--gray-400)">${escHtml(doc.customer_name)} · ${escHtml(doc.hc_name)}</div>
                  </div>
                  ${doc.overall_score != null ? `<span class="score-pill ${doc.overall_score>=75?'good':doc.overall_score>=50?'warn':'poor'}" style="font-size:11px;flex-shrink:0">${doc.overall_score}</span>` : ''}
                </div>
                <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px">
                  <span style="color:var(--red)">${doc.failed_checks} ${t('reports.accFailed2')}</span>
                  <span style="color:var(--yellow)">${doc.warning_checks} ${t('reports.accWarning')}</span>
                  <span style="color:var(--green)">${doc.passed_checks} ${t('reports.accPassed')}</span>
                </div>
                <div class="progress-bar" style="height:5px">
                  <div class="progress-fill" style="width:${pct}%;background:${pct>=80?'var(--green)':pct>=50?'var(--yellow)':'var(--red)'}"></div>
                </div>
              </div>`;
            }).join('')}
          </div>` : `<div class="empty-state" style="padding:20px"><h3>${t('reports.noFailures')}</h3><p>${t('reports.noFailuresSub')}</p></div>`}
        </div>
      </div>

      <!-- Drill-down area -->
      <div id="accDrilldown" style="margin-top:20px"></div>`;

    // Wire up check row clicks via event listeners (avoids JSON.stringify/double-quote attribute issue)
    document.querySelectorAll('.acc-check-row').forEach(row => {
      row.addEventListener('click', () => {
        window.ReportsView.drillAccessibility(row.dataset.check);
      });
    });
  }

  // Accessibility drill-down: documents failing a specific check
  window.ReportsView.drillAccessibility = async function(checkName) {
    const panel = document.getElementById('accDrilldown');
    if (!panel) return;
    panel.innerHTML = `<div class="card"><div class="section-title"><span>Loading "${escHtml(checkName)}"…</span></div>${loadingState()}</div>`;
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    document.querySelectorAll('.acc-check-row').forEach(r => {
      r.classList.toggle('row-active', r.dataset.check === checkName);
    });

    try {
      const res  = await API.stats.accessibilityDrilldown(checkName, _filter);
      const data = res.data || {};
      const docs = data.documents || [];

      if (!docs.length) {
        panel.innerHTML = `<div class="card">
          <div class="section-title">
            <span>${escHtml(checkName)}</span>
            <button class="btn btn-ghost btn-sm" onclick="document.getElementById('accDrilldown').innerHTML=''">✕ Close</button>
          </div>
          <div class="empty-state" style="padding:20px">
            <h3>${t('reports.accNoFailing')}</h3>
            <p>${t('reports.accNoFailingSub')}</p>
          </div>
        </div>`;
        return;
      }

      const statusColor = s => s.includes('fail') ? 'var(--red)' : s.includes('warn') ? 'var(--yellow)' : 'var(--green)';
      const statusLabel = s => s.includes('fail') ? t('reports.accFailed2') : s.includes('warn') ? t('reports.accWarning') : s.includes('manual') ? t('reports.accManual') : ucFirst(s);

      panel.innerHTML = `
        <div class="card card-table">
          <div class="section-title">
            <div>
              <span>${escHtml(checkName)}</span>
              <span style="font-size:12px;font-weight:400;color:var(--gray-400);margin-left:8px">
                ${t('reports.accDocsWithIssues', { count: docs.length, s: docs.length !== 1 ? 's' : '' })}
              </span>
            </div>
            <button class="btn btn-ghost btn-sm" onclick="document.getElementById('accDrilldown').innerHTML=''">${t('reports.drillClose')}</button>
          </div>

          <!-- Mini summary -->
          <div class="card-table-body"><div style="display:flex;gap:16px;padding-bottom:4px">
            ${['failed','warning','needs_manual'].map(statusKey => {
              const n = docs.filter(d => d.check_status.includes(statusKey === 'warning' ? 'warn' : statusKey)).length;
              if (!n) return '';
              const color = statusKey === 'failed' ? 'var(--red)' : statusKey === 'warning' ? 'var(--yellow)' : 'var(--purple)';
              const label = statusKey === 'failed' ? t('reports.accFailed2') : statusKey === 'warning' ? t('reports.accWarning') : t('reports.accManual');
              return `<div style="padding:8px 14px;border-radius:8px;background:var(--gray-100);text-align:center">
                <div style="font-size:18px;font-weight:700;color:${color}">${n}</div>
                <div style="font-size:11px;color:var(--gray-500)">${label}</div>
              </div>`;
            }).join('')}
          </div></div>

          <div class="table-wrap"><table>
            <thead><tr>
              <th>${t('reports.thFile')}</th><th>${t('reports.thCustomer')}</th><th>${t('reports.thHc')}</th>
              <th>${t('reports.accThCheckResult')}</th><th>${t('reports.accThPasses')}</th><th>${t('reports.accThFailures')}</th><th>${t('reports.accThWarnings')}</th><th>${t('reports.thScore')}</th>
            </tr></thead>
            <tbody>
              ${docs.map(doc => `
                <tr style="cursor:pointer" onclick="App.navigate('healthchecks',{id:${doc.hc_id}})">
                  <td>
                    <div style="display:flex;align-items:center;gap:6px">
                      <div class="file-icon" style="width:24px;height:24px;border-radius:4px;flex-shrink:0">
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M16.3413 5.28027L12.7192 1.65918C12.2944 1.23438 11.7295 1 11.1289 1H5.25C4.00928 1 3 2.00977 3 3.25V15.75C3 16.9902 4.00928 18 5.25 18H14.75C15.9907 18 17 16.9902 17 15.75V6.87109C17 6.27929 16.7603 5.69921 16.3413 5.28027ZM15.2803 6.34082C15.3259 6.38647 15.3541 6.44458 15.3863 6.5H12.25C11.8364 6.5 11.5 6.16309 11.5 5.75V2.61401C11.5552 2.64624 11.6132 2.67419 11.6587 2.71972L15.2803 6.34082ZM14.75 16.5H5.25C4.83643 16.5 4.5 16.1631 4.5 15.75V3.25C4.5 2.83691 4.83643 2.5 5.25 2.5H10V5.75C10 6.99023 11.0093 8 12.25 8H15.5V15.75C15.5 16.1631 15.1636 16.5 14.75 16.5Z" fill="currentColor"/>
</svg>
  
                      </div>
                      <span style="font-size:12px;font-weight:500;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(doc.filename)}</span>
                    </div>
                  </td>
                  <td class="text-sm text-muted">${escHtml(doc.customer_name)}</td>
                  <td class="text-sm">${escHtml(doc.hc_name)}</td>
                  <td>
                    <span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:20px;
                      color:${statusColor(doc.check_status)};background:${doc.check_status.includes('fail')?'var(--red-light)':doc.check_status.includes('warn')?'var(--yellow-light)':'var(--purple-light)'}">
                      ${statusLabel(doc.check_status)}
                    </span>
                  </td>
                  <td style="text-align:center;color:var(--green);font-size:12px">${doc.passed_checks}</td>
                  <td style="text-align:center;color:${doc.failed_checks>0?'var(--red)':'var(--gray-400)'};font-size:12px;font-weight:${doc.failed_checks>0?'600':'400'}">${doc.failed_checks}</td>
                  <td style="text-align:center;color:${doc.warning_checks>0?'var(--yellow)':'var(--gray-400)'};font-size:12px">${doc.warning_checks}</td>
                  <td>${doc.overall_score!=null?`<span class="score-pill ${doc.overall_score>=75?'good':doc.overall_score>=50?'warn':'poor'}">${doc.overall_score}</span>`:'—'}</td>
                </tr>`).join('')}
            </tbody>
          </table></div>
        </div>`;
    } catch (e) {
      panel.innerHTML = `<div class="connection-banner">${e.message}</div>`;
    }
  };

  // ── Usability ─────────────────────────────────────────────────────────────────
  async function renderUsability(c, filter = {}) {
    const [ovRes, secRes] = await Promise.all([
      API.stats.overview(filter),
      API.stats.security(filter).catch(() => ({ data: {} })),
    ]);
    const ov    = ovRes.data  || {};
    const secD  = secRes.data || {};
    const secTot = secD.totals || {};
    const total  = (ov.total_pdfs || 1);
    if (!ov.total_health_checks) { _noDataCard(c); return; }

    const linearPct   = Math.round((ov.linearized_pdfs    || 0) / total * 100);
    const versionPct  = Math.round((ov.pdf_version_compliant || 0) / total * 100);
    const hasTitlePct    = Math.round((ov.has_title_pdfs    || 0) / total * 100);
    const hasSubjectPct  = Math.round((ov.has_subject_pdfs  || 0) / total * 100);
    const hasKeywordsPct = Math.round((ov.has_keywords_pdfs || 0) / total * 100);
    const hasAuthorPct   = Math.round((ov.has_author_pdfs   || 0) / total * 100);
    const hasDatePct     = Math.round((ov.has_date_pdfs     || 0) / total * 100);
    const metaCompletePct = Math.round((hasTitlePct + hasSubjectPct + hasKeywordsPct + hasAuthorPct + hasDatePct) / 5);
    const pdfuaPct    = Math.round((ov.pdfua_pdfs || 0) / total * 100);

    function statCard(label, value, sub, color) {
      return `<div class="card" style="text-align:center">
        <div class="stat-label" style="margin-bottom:6px">${label}</div>
        <div style="font-size:28px;font-weight:700;color:${color}">${value}</div>
        ${sub ? `<div class="stat-sub" style="margin-top:4px">${sub}</div>` : ''}
      </div>`;
    }

    c.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px">
        ${statCard(t('reports.usabilityLinearized'),   linearPct+'%',        t('reports.usabilityLinearizedSub'), 'var(--accent)')}
        ${statCard(t('reports.usabilityVersion'),      versionPct+'%',       t('reports.usabilityVersionSub'),    'var(--green)')}
        ${statCard(t('reports.usabilityMetadata'),     metaCompletePct+'%',  t('reports.usabilityMetadataSub'),   'var(--purple)')}
        ${statCard(t('reports.usabilityPdfua'),        pdfuaPct+'%',         t('reports.usabilityPdfuaSub'),      Charts.CAT[0])}
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px">
        <div class="card">
          <div class="section-title"><span>${t('reports.metadataCompleteness')}</span></div>
          <div style="margin-top:12px" id="usabilityMetaChart"></div>
        </div>
        <div class="card">
          <div class="section-title"><span>${t('reports.structuralProperties')}</span></div>
          <div style="margin-top:12px" id="usabilityStructChart"></div>
        </div>
      </div>

      <div class="card" style="margin-bottom:20px">
        <div class="section-title"><span>${t('reports.permissionsBreakdown')}</span></div>
        <div style="font-size:12px;color:var(--gray-400);margin-bottom:8px">${t('reports.permissionsNote')}</div>
        <div style="margin-top:8px" id="usabilityPermChart"></div>
      </div>`;

    Charts.hbar(document.getElementById('usabilityMetaChart'), {
      items: [
        { label: t('doc.infoTitle'),    value: hasTitlePct,    color: Charts.CAT[5] },
        { label: t('doc.infoSubject'),  value: hasSubjectPct,  color: Charts.CAT[0] },
        { label: t('doc.infoKeywords'), value: hasKeywordsPct, color: Charts.CAT[2] },
        { label: t('doc.author'),       value: hasAuthorPct,   color: Charts.CAT[1] },
        { label: t('doc.infoCreationDate'), value: hasDatePct, color: Charts.CAT[6] },
      ],
      max: 100
    });

    Charts.hbar(document.getElementById('usabilityStructChart'), {
      items: [
        { label: t('dashboard.linearized'),  value: linearPct,  color: Charts.CAT[5] },
        { label: t('dashboard.versionOk'),   value: versionPct, color: Charts.CAT[0] },
        { label: t('dashboard.taggedPdfs'),  value: Math.round((ov.tagged_pdfs||0)/total*100), color: Charts.CAT[2] },
        { label: t('dashboard.pdfuaCompliance'), value: pdfuaPct, color: Charts.CAT[1] },
      ],
      max: 100
    });

    // Permissions breakdown — only relevant for encrypted PDFs
    // "% not blocked" out of all PDFs (null = unencrypted = no restriction = fine)
    const permEl = document.getElementById('usabilityPermChart');
    if (permEl && int(secTot.total) > 0) {
      const t2 = int(secTot.total) || 1;
      Charts.hbar(permEl, {
        items: [
          { label: t('doc.permAssistiveTech'),   value: Math.round((t2 - int(secTot.assistive_tech_blocked||0)) / t2 * 100), color: Charts.CAT[0] },
          { label: t('doc.permissionsAllowCopy'),value: Math.round((t2 - int(secTot.copy_restricted       ||0)) / t2 * 100), color: Charts.CAT[2] },
          { label: t('doc.permPrinting'),        value: Math.round((t2 - int(secTot.printing_blocked       ||0)) / t2 * 100), color: Charts.CAT[5] },
          { label: t('doc.permFormFilling'),     value: Math.round((t2 - int(secTot.form_filling_blocked   ||0)) / t2 * 100), color: Charts.CAT[1] },
          { label: t('doc.permCommenting'),      value: Math.round((t2 - int(secTot.commenting_blocked     ||0)) / t2 * 100), color: Charts.CAT[6] },
        ],
        max: 100
      });
    } else if (permEl) {
      permEl.innerHTML = `<div style="color:var(--gray-400);font-size:12px;padding:12px 0">${t('reports.permissionsNoData')}</div>`;
    }
  }

  // ── By Customer ───────────────────────────────────────────────────────────────
  async function renderByCustomer(c, filter = {}) {
    let customers;
    if (filter.customerId) {
      // Single customer — use get() and wrap in array
      const res = await API.customers.get(filter.customerId);
      customers = res.data ? [res.data] : [];
    } else {
      const res = await API.customers.list();
      customers = res.data || [];
    }
    if (!customers.length) { c.innerHTML = emptyState(t('reports.noCustomers')); return; }

    c.innerHTML = `
      <div class="card card-table">
        <div class="section-title"><span>${t('reports.custComparison')}</span></div>
        <div class="card-table-body"><div id="custBarChart" style="margin:12px 0 16px"></div></div>
        <div class="table-wrap"><table>
          <thead><tr><th>${t('reports.thCustomer')}</th><th>${t('reports.thRegion')}</th><th>${t('reports.thVertical')}</th><th>${t('reports.thSegment')}</th><th>${t('reports.thChecks')}</th><th>${t('reports.thPdfs')}</th><th>${t('reports.thAvgScore')}</th><th>${t('reports.thLastCheck')}</th></tr></thead>
          <tbody>
            ${customers.map(cu => `<tr style="cursor:pointer" onclick="App.navigate('customers',{id:${cu.id}})">
              <td class="font-medium">${escHtml(cu.display_name)}</td>
              <td class="text-sm text-muted">${cu.region || '—'}</td>
              <td class="text-sm text-muted">${cu.vertical || '—'}</td>
              <td class="text-sm text-muted">${cu.segment || '—'}</td>
              <td>${cu.health_check_count || 0}</td>
              <td>${cu.pdf_count || 0}</td>
              <td>${cu.avg_score != null ? `<span class="score-pill ${cu.avg_score>=75?'good':cu.avg_score>=50?'warn':'poor'}">${cu.avg_score}</span>` : '—'}</td>
              <td class="text-sm text-muted">${cu.last_check ? formatDate(cu.last_check) : '—'}</td>
            </tr>`).join('')}
          </tbody>
        </table></div>
      </div>`;

    // Spectrum categorical palette — one colour per customer in sequence
    Charts.hbar(document.getElementById('custBarChart'), {
      items: customers.filter(cu => cu.avg_score != null).map((cu, i) => ({
        label: cu.display_name.slice(0, 18),
        value: cu.avg_score,
        color: Charts.CAT[i % Charts.CAT.length]
      })),
      max: 100
    });
  }

  // ── By Dimension ──────────────────────────────────────────────────────────────
  async function renderByDim(c, dim, filter = {}) {
    const fns  = { region: API.stats.byRegion, vertical: API.stats.byVertical, segment: API.stats.bySegment, country: API.stats.byCountry };
    const res  = await fns[dim](filter);
    const rows = res.data || [];
    const label = dim.charAt(0).toUpperCase() + dim.slice(1);

    if (!rows.length) { c.innerHTML = emptyState(t('reports.noDataBy', { label })); return; }

    c.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
        <div class="card">
          <div class="section-title"><span>${t('reports.scoreBy', { label })}</span></div>
          <div id="dimBarChart" style="margin-top:12px"></div>
        </div>
        <div class="card card-table">
          <div class="section-title"><span>${t('reports.summaryBy', { label })}</span></div>
          <div class="table-wrap"><table>
            <thead><tr><th>${label}</th><th>${t('reports.thCustomers')}</th><th>${t('reports.thChecks')}</th><th>${t('reports.thAvgScore')}</th></tr></thead>
            <tbody>
              ${rows.map(r => `<tr>
                <td class="font-medium">${escHtml(r[dim] || 'Unknown')}</td>
                <td>${r.customer_count || 0}</td>
                <td>${r.check_count || 0}</td>
                <td>${r.avg_score != null ? `<span class="score-pill ${r.avg_score>=75?'good':r.avg_score>=50?'warn':'poor'}">${r.avg_score}</span>` : '—'}</td>
              </tr>`).join('')}
            </tbody>
          </table></div>
        </div>
      </div>`;

    // Spectrum categorical palette — sequential across rows, no semantic colour-coding
    Charts.hbar(document.getElementById('dimBarChart'), {
      items: rows.map((r, i) => ({
        label: (r[dim] || 'Unknown').slice(0, 18),
        value: r.avg_score || 0,
        color: Charts.CAT[i % Charts.CAT.length]
      })),
      max: 100
    });
  }

  // ── Metadata & PII ────────────────────────────────────────────────────────────
  async function renderMetadata(c, filter = {}) {
    const [res, trendRes] = await Promise.all([
      API.stats.piiDocs(filter),
      API.stats.trend(30, filter).catch(() => ({ data: {} }))
    ]);
    const d    = res.data || {};
    const total      = int(d.total);
    const piiCount   = int(d.pii_count);
    if (!total) { _noDataCard(c); return; }
    const hasAuthor  = int(d.has_author);
    const noAuthor   = int(d.no_author);
    const piiPct     = total > 0 ? Math.round(piiCount   / total * 100) : 0;
    const authorPct  = total > 0 ? Math.round(hasAuthor  / total * 100) : 0;
    const byCustomer = d.by_customer || [];
    const atRisk     = d.at_risk     || [];
    const tr         = trendRes.data || {};

    const riskColor = piiCount === 0 ? 'var(--green)' : piiPct > 25 ? 'var(--red)' : 'var(--yellow)';

    c.innerHTML = `
      <!-- Headline stats ────────────────────────────────────────────────── -->
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:20px">
        ${accStatCard(t('reports.piiTotalPdfs'),    total + '',    'rgb(20,122,243)', tr.pdfs, t('reports.piiSparkTooltip'))}
        ${accStatCard(t('reports.piiHasAuthor'),   hasAuthor + ' (' + authorPct + '%)', 'rgb(15,181,174)')}
        ${accStatCard(t('reports.piiNoAuthor'),    noAuthor + '',  'rgb(64,70,202)')}
        ${accStatCard(t('reports.piiFlag'),        piiCount  + ' (' + piiPct + '%)', riskColor, tr.pii, t('reports.piiSparkPii'))}
      </div>

      <!-- Risk ring + explanation ─────────────────────────────────────── -->
      <div style="display:grid;grid-template-columns:220px 1fr;gap:20px;margin-bottom:20px;align-items:start">

        <div class="card" style="display:flex;flex-direction:column;align-items:center;gap:14px;text-align:center">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--gray-500)">${t('reports.piiExposure')}</div>
          <div id="piiRiskDonut"></div>
          <div style="font-size:12px;color:var(--gray-500);line-height:1.5">
            ${t('reports.piiDocsHave', { piiCount, total })}
          </div>
        </div>

        <div class="card">
          <div class="section-title"><span>${t('reports.piiWhatTitle')}</span></div>
          <div style="font-size:13px;color:var(--gray-600);line-height:1.65;margin-bottom:14px">
            ${t('reports.piiInfoBody')}
          </div>
          <div style="display:flex;flex-direction:column;gap:8px">
            <div style="display:flex;gap:10px;align-items:flex-start;font-size:12px">
              <span style="color:var(--red);font-size:15px;line-height:1">⚠</span>
              <span>${t('reports.piiInfoGdpr')}</span>
            </div>
            <div style="display:flex;gap:10px;align-items:flex-start;font-size:12px">
              <span style="color:var(--yellow);font-size:15px;line-height:1">ℹ</span>
              <span>${t('reports.piiInfoMl')}</span>
            </div>
            <div style="display:flex;gap:10px;align-items:flex-start;font-size:12px">
              <span style="color:var(--green);font-size:15px;line-height:1">✓</span>
              <span>${t('reports.piiInfoRemediation')}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Per-customer breakdown ──────────────────────────────────────── -->
      ${byCustomer.length ? `
      <div class="card card-table" style="margin-bottom:20px">
        <div class="section-title"><span>${t('reports.piiRiskByCustomer')}</span></div>
        <div class="card-table-body"><div id="piiCustChart" style="margin:12px 0 12px"></div></div>
        <div class="table-wrap"><table>
          <thead><tr>
            <th>${t('reports.thCustomer')}</th>
            <th style="text-align:right">${t('reports.piiThTotalPdfs')}</th>
            <th style="text-align:right">${t('reports.piiThHasAuthor')}</th>
            <th style="text-align:right">${t('reports.piiThPiiFlags')}</th>
            <th style="width:140px">${t('reports.piiThRiskRate')}</th>
          </tr></thead>
          <tbody>
            ${byCustomer.map(cu => {
              const rate = cu.total_docs > 0 ? Math.round(cu.pii_count / cu.total_docs * 100) : 0;
              const col  = cu.pii_count === 0 ? 'var(--green)' : rate > 25 ? 'var(--red)' : 'var(--yellow)';
              return `<tr>
                <td class="font-medium">${escHtml(cu.customer_name)}</td>
                <td style="text-align:right">${cu.total_docs}</td>
                <td style="text-align:right;color:var(--gray-500)">${cu.has_author_count}</td>
                <td style="text-align:right;font-weight:${cu.pii_count>0?'600':'400'};color:${cu.pii_count>0?col:'var(--gray-400)'}">
                  ${cu.pii_count}
                </td>
                <td>
                  <div style="display:flex;align-items:center;gap:6px">
                    <div class="progress-bar" style="height:5px;flex:1">
                      <div class="progress-fill" style="width:${rate}%;background:${col}"></div>
                    </div>
                    <span style="font-size:11px;color:var(--gray-500);width:30px;text-align:right">${rate}%</span>
                  </div>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table></div>
      </div>` : ''}

      <!-- At-risk documents table ─────────────────────────────────────── -->
      <div class="card card-table">
        <div class="section-title">
          <div>
            <span>${t('reports.piiAtRiskTitle')}
              <span style="font-size:12px;font-weight:400;color:var(--gray-400);margin-left:6px">(${atRisk.length})</span>
            </span>
            <div style="font-size:11px;color:var(--gray-400);font-weight:400;margin-top:2px">
              ${t('reports.piiAtRiskSub')}
            </div>
          </div>
        </div>
        ${atRisk.length ? `
        <div class="table-wrap" style="max-height:520px;overflow-y:auto"><table>
          <thead><tr>
            <th>${t('reports.piiThFile')}</th>
            <th>${t('reports.piiThAuthor')}</th>
            <th>${t('reports.piiThCustomer')}</th>
            <th>${t('reports.piiThHc')}</th>
            <th>${t('reports.piiThScore')}</th>
            <th style="text-align:center;min-width:120px">${t('reports.piiThCorrect')}</th>
            <th></th>
          </tr></thead>
          <tbody id="piiAtRiskBody">
            ${atRisk.map((doc, idx) => piiAtRiskRow(doc, idx)).join('')}
          </tbody>
        </table></div>
        ` : `
        <div class="empty-state" style="padding:28px">
          <svg viewBox="0 0 24 24" fill="none" style="width:36px;height:36px;color:var(--green)">
            <circle cx="12" cy="10" r="4" stroke="currentColor" stroke-width="1.5"/>
            <path d="M4 21c0-3.87 3.58-7 8-7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            <path d="M16 18l2 2 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <h3 style="color:var(--green)">${t('reports.noPiiDetected')}</h3>
          <p>${t('reports.noPiiDetectedSub')}</p>
        </div>`}
      </div>`;

    // ── PII exposure donut — Spectrum style, inverted risk coloring
    const piiRiskLabel = piiCount === 0 ? t('dashboard.scoreGood') : piiPct > 25 ? t('dashboard.scorePoor') : t('dashboard.scoreFair');
    Charts.donut(document.getElementById('piiRiskDonut'), {
      segments: [
        { value: piiPct,       color: riskColor },
        { value: 100 - piiPct, color: 'var(--gray-200)' },
      ],
      size:     120,
      label:    `${piiPct}%`,
      sublabel: piiRiskLabel,
    });

    // Render per-customer PII bar chart if we have data
    if (byCustomer.length) {
      const piiCustEl = document.getElementById('piiCustChart');
      if (piiCustEl) {
        Charts.hbar(piiCustEl, {
          items: byCustomer.filter(cu => cu.total_docs > 0).map((cu, i) => ({
            label: (cu.customer_name || 'Unknown').slice(0, 20),
            value: cu.total_docs > 0 ? Math.round(cu.pii_count / cu.total_docs * 100) : 0,
            color: cu.pii_count === 0 ? 'var(--green)'
                 : Math.round(cu.pii_count / cu.total_docs * 100) > 25 ? 'var(--red)'
                 : 'var(--yellow)'
          })),
          max: 100
        });
      }
    }

    // Wire feedback buttons (must run after innerHTML is set)
    _wirePiiFeedback(atRisk);
  }

  // ── Customer Comparison ───────────────────────────────────────────────────────
  async function renderCompare(c) {
    // Load customers list for picker
    let customers = [];
    try { const r = await API.customers.list(); customers = r.data || []; } catch {}

    // Initial UI: pickers only (no data yet)
    c.innerHTML = `
      <div class="card" style="margin-bottom:20px">
        <div class="section-title"><span>${t('reports.compareTitle')}</span></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
          <div class="form-group" style="margin:0">
            <label class="form-label">${t('reports.compareSubject')}</label>
            <select class="form-select" id="cmpSubject">
              <option value="">— Select customer —</option>
              ${customers.map(cu => `<option value="${cu.id}">${escHtml(cu.display_name)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="margin:0">
            <label class="form-label">${t('reports.compareAgainst')}</label>
            <select class="form-select" id="cmpAgainst">
              <option value="overall">${t('reports.compareOverall')}</option>
              <optgroup id="cmpSegmentGroup" label="${t('reports.compareBySegment')}">
                <option value="segment:Commercial">${t('customers.segmentCommercial') || 'Commercial'}</option>
                <option value="segment:Government">${t('customers.segmentGovernment') || 'Government'}</option>
                <option value="segment:Education">${t('customers.segmentEducation') || 'Education'}</option>
              </optgroup>
              <optgroup id="cmpRegionGroup" label="${t('reports.compareByRegion')}"></optgroup>
              <optgroup id="cmpVerticalGroup" label="${t('reports.compareByVertical')}"></optgroup>
              <optgroup id="cmpCustomerGroup" label="${t('reports.compareAnother')}">
                ${customers.map(cu => `<option value="customer:${cu.id}">${escHtml(cu.display_name)}</option>`).join('')}
              </optgroup>
            </select>
          </div>
        </div>
        <button class="btn btn-primary" id="cmpRunBtn">
          <svg viewBox="0 0 16 16" fill="none"><path d="M5 3l8 5-8 5V3z" fill="currentColor"/></svg>
          ${t('reports.compareRun')}
        </button>
      </div>
      <div id="cmpResult"></div>`;

    // SearchableSelect on both compare pickers
    if (typeof SearchableSelect !== 'undefined') {
      const subjectEl = document.getElementById('cmpSubject');
      const againstEl = document.getElementById('cmpAgainst');
      if (subjectEl) new SearchableSelect(subjectEl, { placeholder: 'Search customers…' });
      if (againstEl) new SearchableSelect(againstEl, { placeholder: 'Search…' });
    }

    // Fetch regions & verticals to populate option groups
    try {
      const [rr, rv] = await Promise.all([API.stats.byRegion(), API.stats.byVertical()]);
      const regGroup = document.getElementById('cmpRegionGroup');
      const verGroup = document.getElementById('cmpVerticalGroup');
      (rr.data || []).forEach(r => {
        const o = document.createElement('option');
        o.value = `region:${r.region}`;
        o.textContent = r.region;
        regGroup.appendChild(o);
      });
      (rv.data || []).forEach(v => {
        const o = document.createElement('option');
        o.value = `vertical:${v.vertical}`;
        o.textContent = v.vertical;
        verGroup.appendChild(o);
      });
    } catch {}

    document.getElementById('cmpRunBtn').onclick = () => {
      const custId  = document.getElementById('cmpSubject').value;
      const against = document.getElementById('cmpAgainst').value;
      if (!custId) { Toast.show(t('reports.compareSelectCust'), 'warning'); return; }
      // Fire-and-forget: runComparison handles its own errors internally
      runComparison(custId, against).catch(err => {
        console.warn('[Compare] runComparison unexpected error:', err);
        const resultEl = document.getElementById('cmpResult');
        if (resultEl) resultEl.innerHTML = `<div class="connection-banner">${escHtml(err.message || 'Unknown error')}</div>`;
      });
    };
  }

  async function runComparison(custId, against) {
    const resultEl = document.getElementById('cmpResult');
    if (!resultEl) return;
    resultEl.innerHTML = `<div class="flex items-center gap-8" style="color:var(--gray-400);font-size:13px"><div class="loading-spinner"></div> ${t('reports.compareRunning')}</div>`;

    try {
      const res  = await API.stats.compare(custId, against);
      const data = res.data;
      if (!data || !data.subject || !data.baseline) {
        throw new Error('Unexpected response from server — missing comparison data');
      }
      renderCompareResult(resultEl, data.subject, data.baseline);
    } catch (e) {
      resultEl.innerHTML = `<div class="connection-banner">${escHtml(e.message || 'Unknown error')}</div>`;
    }
  }

  function renderCompareResult(el, subject, baseline) {
    const metrics = [
      { key: 'avg_score',       label: 'Avg Score',           unit: '/100', higherIsBetter: true },
      { key: 'total_pdfs',      label: 'Total PDFs',          unit: '',     higherIsBetter: null },
      { key: 'tagged_pct',      label: 'Tagged PDFs',         unit: '%',    higherIsBetter: true },
      { key: 'avg_access_rate', label: 'Avg Accessibility',   unit: '%',    higherIsBetter: true },
      { key: 'linearized_pct',  label: 'Linearized',          unit: '%',    higherIsBetter: true },
      { key: 'version17_pct',   label: 'PDF ≥ 1.7',           unit: '%',    higherIsBetter: true },
      { key: 'encrypted_pct',   label: 'Encrypted PDFs',      unit: '%',    higherIsBetter: false },
      { key: 'xfa_pct',         label: 'Has XFA Forms',       unit: '%',    higherIsBetter: false },
      { key: 'pii_count',       label: 'Author PII Flags',    unit: '',     higherIsBetter: false },
    ];

    const metricsHtml = metrics.map(m => {
      const sv = subject.metrics[m.key]  ?? null;
      const bv = baseline.metrics[m.key] ?? null;
      const delta = (sv !== null && bv !== null) ? (sv - bv) : null;

      let deltaHtml = '';
      if (delta !== null && m.higherIsBetter !== null) {
        const isGood = m.higherIsBetter ? delta >= 0 : delta <= 0;
        const sign   = delta > 0 ? '+' : '';
        const col    = isGood ? 'var(--green)' : 'var(--red)';
        const arr    = delta > 0 ? '▲' : delta < 0 ? '▼' : '=';
        deltaHtml = `<span style="font-size:11px;font-weight:600;color:${col}">${arr} ${sign}${delta}${m.unit}</span>`;
      }

      const subjectVal  = sv !== null ? `${sv}${m.unit}` : '—';
      const baselineVal = bv !== null ? `${bv}${m.unit}` : '—';

      // Determine which side "wins"
      let subjStyle   = 'background:var(--gray-75)';
      let baseStyle   = 'background:var(--gray-75)';
      if (delta !== null && m.higherIsBetter !== null && delta !== 0) {
        const subjectWins = m.higherIsBetter ? delta > 0 : delta < 0;
        if (subjectWins) subjStyle = 'background:var(--green-light)';
        else             baseStyle = 'background:var(--accent-light)';
      }

      return `
        <div class="cmp-metric-row">
          <div class="cmp-metric-label">${m.label}</div>
          <div class="cmp-metric-cell" style="${subjStyle}">
            <span class="cmp-metric-val">${subjectVal}</span>
          </div>
          <div class="cmp-delta">${deltaHtml}</div>
          <div class="cmp-metric-cell" style="${baseStyle}">
            <span class="cmp-metric-val">${baselineVal}</span>
          </div>
        </div>`;
    }).join('');

    el.innerHTML = `
      <div class="card">
        <!-- Header row -->
        <div class="cmp-header-row">
          <div class="cmp-metric-label"></div>
          <div class="cmp-col-head">
            <svg viewBox="0 0 14 14" fill="none" style="width:13px;height:13px;flex-shrink:0"><circle cx="5.5" cy="5.5" r="3" stroke="currentColor" stroke-width="1.3"/><path d="M2 12c0-2 1.57-3.5 3.5-3.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="10" cy="9" r="2" stroke="currentColor" stroke-width="1.3"/><path d="M7.5 12.5c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
            ${escHtml(subject.label)}
          </div>
          <div style="width:80px;text-align:center;font-size:11px;color:var(--gray-400);font-weight:600">${t('reports.compareDelta')}</div>
          <div class="cmp-col-head" style="background:var(--accent-light);color:var(--accent)">
            <svg viewBox="0 0 14 14" fill="none" style="width:13px;height:13px;flex-shrink:0"><rect x="2" y="2" width="10" height="10" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M5 7h4M7 5v4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
            ${escHtml(baseline.label)}
          </div>
        </div>
        <!-- Metric rows -->
        <div class="cmp-body">
          ${metricsHtml}
        </div>
        <!-- Summary callout -->
        <div class="cmp-summary">
          ${renderCompareSummary(subject, baseline)}
        </div>
      </div>`;
  }

  function renderCompareSummary(subject, baseline) {
    const sm = subject.metrics;
    const bm = baseline.metrics;
    const scoreDelta = (sm.avg_score ?? 0) - (bm.avg_score ?? 0);
    const accessDelta = (sm.avg_access_rate ?? 0) - (bm.avg_access_rate ?? 0);
    const strengths = [], weaknesses = [];

    if (scoreDelta >= 5)   strengths.push(`Avg score is <strong>+${scoreDelta} pts</strong> above baseline`);
    if (scoreDelta <= -5)  weaknesses.push(`Avg score is <strong>${scoreDelta} pts</strong> below baseline`);
    if (accessDelta >= 5)  strengths.push(`Accessibility rate is <strong>+${accessDelta}%</strong> higher`);
    if (accessDelta <= -5) weaknesses.push(`Accessibility rate is <strong>${accessDelta}%</strong> lower`);
    if ((sm.tagged_pct ?? 0) > (bm.tagged_pct ?? 0) + 5) strengths.push('Higher rate of tagged PDFs');
    if ((sm.tagged_pct ?? 0) < (bm.tagged_pct ?? 0) - 5) weaknesses.push('Lower rate of tagged PDFs');
    if ((sm.encrypted_pct ?? 0) < (bm.encrypted_pct ?? 0) - 5) strengths.push('Fewer encrypted PDFs (better access)');
    if ((sm.encrypted_pct ?? 0) > (bm.encrypted_pct ?? 0) + 5) weaknesses.push('Higher rate of encrypted PDFs');
    if ((sm.pii_count ?? 0) > 0) weaknesses.push(`${sm.pii_count} document(s) with author PII flags`);

    if (!strengths.length && !weaknesses.length) {
      return `<div style="font-size:12px;color:var(--gray-500)">${t('reports.compareRoughly')}</div>`;
    }

    return `
      ${strengths.length ? `
        <div style="margin-bottom:8px">
          <div style="font-size:11px;font-weight:700;color:var(--green);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">${t('reports.compareStrengths')}</div>
          ${strengths.map(s => `<div style="font-size:12px;color:var(--gray-700);padding:2px 0">✓ ${s}</div>`).join('')}
        </div>` : ''}
      ${weaknesses.length ? `
        <div>
          <div style="font-size:11px;font-weight:700;color:var(--red);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">${t('reports.compareImprove')}</div>
          ${weaknesses.map(w => `<div style="font-size:12px;color:var(--gray-700);padding:2px 0">⚠ ${w}</div>`).join('')}
        </div>` : ''}`;
  }

  // ── PII confidence badge ──────────────────────────────────────────────────────
  // Small inline indicator shown below the author name pill.
  // source === 'confirmed' → oracle (previous human feedback) → always 100 %
  // source === 'heuristic' → weighted rule scorer → colour-coded percentage
  function _piiConfidenceBadge(doc) {
    const pct    = doc.pii_confidence ?? null;
    const source = doc.pii_source     ?? null;
    if (pct === null || source === null) return '';

    if (source === 'confirmed') {
      // Oracle — a human confirmed this author string in a previous document.
      // Show a muted "auto-confirmed" indicator instead of a percentage.
      return `<div style="margin-top:3px;display:flex;align-items:center;gap:3px">
        <svg viewBox="0 0 12 12" fill="none" style="width:10px;height:10px;color:var(--green);flex-shrink:0">
          <path d="M2 6.5l2.5 2.5 5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span style="font-size:10px;color:var(--green)">${t('reports.piiSrcConfirmed')}</span>
      </div>`;
    }

    // Heuristic — colour by confidence band
    const color = pct >= 70 ? 'var(--green)'
                : pct >= 50 ? 'var(--orange, #f59e0b)'
                :             'var(--gray-400)';
    const label = `${pct}%`;
    return `<div style="margin-top:3px;display:flex;align-items:center;gap:3px">
      <div style="width:32px;height:3px;border-radius:2px;background:var(--gray-200);overflow:hidden;flex-shrink:0">
        <div style="width:${pct}%;height:100%;background:${color};border-radius:2px"></div>
      </div>
      <span style="font-size:10px;color:${color}">${label}</span>
    </div>`;
  }

  // ── PII at-risk row renderer ──────────────────────────────────────────────────
  // Renders a single <tr> for the at-risk table. Called both on initial render
  // and when re-rendering a row after feedback is submitted.
  function piiAtRiskRow(doc, idx) {
    const fb = doc.feedback;  // null | true | false

    // Row opacity: dismissed rows (fb===false) are greyed out
    const rowStyle = fb === false
      ? 'opacity:0.45;transition:opacity .3s'
      : 'transition:opacity .3s';

    // Feedback badge / buttons
    let feedbackCell;
    if (fb === true) {
      feedbackCell = `
        <div style="display:flex;align-items:center;justify-content:center;gap:6px">
          <span style="font-size:11px;font-weight:600;color:var(--green);background:var(--green-light);
                       padding:2px 8px;border-radius:20px">${t('reports.piiConfirmed')}</span>
          <button class="pii-fb-undo" data-idx="${idx}"
                  style="font-size:10px;color:var(--gray-400);background:none;border:none;cursor:pointer;padding:2px 4px"
                  title="Undo">↩</button>
        </div>`;
    } else if (fb === false) {
      feedbackCell = `
        <div style="display:flex;align-items:center;justify-content:center;gap:6px">
          <span style="font-size:11px;font-weight:600;color:var(--red);background:var(--red-light);
                       padding:2px 8px;border-radius:20px">${t('reports.piiDismissed')}</span>
          <button class="pii-fb-undo" data-idx="${idx}"
                  style="font-size:10px;color:var(--gray-400);background:none;border:none;cursor:pointer;padding:2px 4px"
                  title="Undo">↩</button>
        </div>`;
    } else {
      feedbackCell = `
        <div style="display:flex;align-items:center;justify-content:center;gap:6px">
          <button class="pii-fb-btn pii-fb-yes" data-idx="${idx}" title="Yes — this is correctly identified as a person name"
                  style="width:30px;height:30px;border-radius:6px;border:1.5px solid var(--gray-200);
                         background:var(--white);cursor:pointer;display:flex;align-items:center;justify-content:center;
                         color:var(--gray-500);transition:all .15s">
            <svg viewBox="0 0 16 16" fill="none" style="width:14px;height:14px">
              <path d="M3 8.5l3.5 3.5 6.5-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <button class="pii-fb-btn pii-fb-no" data-idx="${idx}" title="No — this is not a person name, the ML was wrong"
                  style="width:30px;height:30px;border-radius:6px;border:1.5px solid var(--gray-200);
                         background:var(--white);cursor:pointer;display:flex;align-items:center;justify-content:center;
                         color:var(--gray-500);transition:all .15s">
            <svg viewBox="0 0 16 16" fill="none" style="width:14px;height:14px">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            </svg>
          </button>
        </div>`;
    }

    return `
      <tr data-pii-idx="${idx}" style="${rowStyle}">
        <td>
          <div style="display:flex;align-items:center;gap:6px">
            <div class="file-icon" style="width:24px;height:24px;border-radius:4px;flex-shrink:0">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M16.3413 5.28027L12.7192 1.65918C12.2944 1.23438 11.7295 1 11.1289 1H5.25C4.00928 1 3 2.00977 3 3.25V15.75C3 16.9902 4.00928 18 5.25 18H14.75C15.9907 18 17 16.9902 17 15.75V6.87109C17 6.27929 16.7603 5.69921 16.3413 5.28027ZM15.2803 6.34082C15.3259 6.38647 15.3541 6.44458 15.3863 6.5H12.25C11.8364 6.5 11.5 6.16309 11.5 5.75V2.61401C11.5552 2.64624 11.6132 2.67419 11.6587 2.71972L15.2803 6.34082ZM14.75 16.5H5.25C4.83643 16.5 4.5 16.1631 4.5 15.75V3.25C4.5 2.83691 4.83643 2.5 5.25 2.5H10V5.75C10 6.99023 11.0093 8 12.25 8H15.5V15.75C15.5 16.1631 15.1636 16.5 14.75 16.5Z" fill="currentColor"/>
</svg>
  
            </div>
            <span style="font-size:12px;font-weight:500;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
                  title="${escHtml(doc.filename || 'document.pdf')}">${escHtml(doc.filename || 'document.pdf')}</span>
          </div>
        </td>
        <td>
          <span style="font-size:12px;font-weight:600;
                       color:${fb===false ? 'var(--gray-400)' : 'var(--red)'};
                       background:${fb===false ? 'var(--gray-100)' : 'var(--red-light)'};
                       padding:2px 8px;border-radius:12px">
            ${escHtml(doc.author || '—')}
          </span>
          ${_piiConfidenceBadge(doc)}
        </td>
        <td class="text-sm text-muted">${escHtml(doc.customer_name || '—')}</td>
        <td class="text-sm">${escHtml(doc.hc_name || '—')}</td>
        <td>${doc.overall_score != null
          ? `<span class="score-pill ${doc.overall_score>=75?'good':doc.overall_score>=50?'warn':'poor'}">${doc.overall_score}</span>`
          : '—'}</td>
        <td style="text-align:center">${feedbackCell}</td>
        <td>${doc.hc_id ? `<span style="font-size:12px;color:var(--accent);cursor:pointer"
                                 onclick="App.navigate('healthchecks',{id:${doc.hc_id}})">${t('common.viewArrow')}</span>` : ''}</td>
      </tr>`;
  }

  // Wire up feedback buttons — called after renderMetadata renders the table.
  // Uses event delegation on the tbody so buttons added later still work.
  //
  // Key behaviour: when the user confirms/dismisses one author, every other row
  // with the exact same author string is updated simultaneously (same-value
  // propagation). API calls are fired in parallel for all affected documents.
  function _wirePiiFeedback(atRisk) {
    const tbody = document.getElementById('piiAtRiskBody');
    if (!tbody) return;

    tbody.addEventListener('click', async e => {
      const yesBtn  = e.target.closest('.pii-fb-yes');
      const noBtn   = e.target.closest('.pii-fb-no');
      const undoBtn = e.target.closest('.pii-fb-undo');
      const btn     = yesBtn || noBtn || undoBtn;
      if (!btn) return;

      const idx = parseInt(btn.dataset.idx, 10);
      const doc = atRisk[idx];
      if (!doc) return;

      // Determine new feedback value
      let newFb;
      if (undoBtn)     newFb = null;   // undo — clear local feedback
      else if (yesBtn) newFb = true;   // confirmed: is a person name
      else             newFb = false;  // dismissed: not a person name

      // ── Find all rows with the same author value ─────────────────────────
      // Normalise to lower-case so "John Smith" and "john smith" are treated
      // as the same value, regardless of which row the user clicked.
      const authorNorm = (doc.author || '').trim().toLowerCase();
      const siblings   = atRisk
        .map((d, i) => ({ doc: d, i }))
        .filter(({ doc: d }) =>
          (d.author || '').trim().toLowerCase() === authorNorm
        );

      // ── Optimistic UI — re-render every affected row immediately ─────────
      siblings.forEach(({ doc: d, i }) => {
        d.feedback = newFb;
        const row = tbody.querySelector(`tr[data-pii-idx="${i}"]`);
        if (row) row.outerHTML = piiAtRiskRow(d, i);
      });

      // Inform the user when more than one row was updated
      if (siblings.length > 1) {
        const action = newFb === true  ? 'confirmed'
                     : newFb === false ? 'dismissed'
                     :                  'reset';
        Toast.show(
          `"${escHtml(doc.author)}" ${action} across all ${siblings.length} documents.`,
          'success', 3500
        );
      }

      // ── Persist to backend for every affected document ───────────────────
      if (newFb !== null) {
        const originalFeedbacks = siblings.map(({ doc: d }) => d.feedback);

        const results = await Promise.allSettled(
          siblings.map(({ doc: d }) =>
            API.stats.piiDocsFeedback({
              document_id:    d.doc_id,
              author:         d.author,
              is_person_name: newFb,
            })
          )
        );

        // Roll back any rows whose API call failed
        const anyFailed = results.some(r => r.status === 'rejected');
        if (anyFailed) {
          console.warn('[PII feedback] one or more saves failed:', results);
          Toast.show(t('toast.piiFailed'), 'error');
          siblings.forEach(({ doc: d, i }, si) => {
            if (results[si].status === 'rejected') {
              d.feedback = originalFeedbacks[si] ?? null;
              const row = tbody.querySelector(`tr[data-pii-idx="${i}"]`);
              if (row) row.outerHTML = piiAtRiskRow(d, i);
            }
          });
        }
      } else {
        // Undo is local-only — no backend delete endpoint exists yet.
        // The DB still holds the previous feedback value; a page reload
        // will re-fetch the persisted state.
        if (siblings.length === 1) {
          Toast.show(t('toast.piiCleared'), 'info', 4000);
        }
      }
    });
  }

  // ── Timeline ─────────────────────────────────────────────────────────────────
  // Shows multi-metric area charts bucketed by PDF creation date.
  async function renderTimeline(c, filter = {}) {
    // ── Controls state ────────────────────────────────────────────────────────
    let granularity = 'month';
    let rangePreset  = '2y';   // 12m | 2y | 5y | custom
    let customFrom   = '';
    let customTo     = '';

    function getDateRange() {
      if (rangePreset === '12m') {
        return { from: fmtDate(addMonths(new Date(), -12)), to: fmtDate(new Date()) };
      }
      if (rangePreset === '2y') {
        return { from: fmtDate(addMonths(new Date(), -24)), to: fmtDate(new Date()) };
      }
      if (rangePreset === '5y') {
        return { from: fmtDate(addMonths(new Date(), -60)), to: fmtDate(new Date()) };
      }
      // custom
      return { from: customFrom || fmtDate(addMonths(new Date(), -24)), to: customTo || fmtDate(new Date()) };
    }

    function fmtDate(d) {
      return d.toISOString().slice(0, 10);
    }

    function addMonths(d, n) {
      const r = new Date(d);
      r.setMonth(r.getMonth() + n);
      return r;
    }

    // ── Build chrome ─────────────────────────────────────────────────────────
    c.innerHTML = `
      <div class="card" style="margin-bottom:16px">
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">

          <!-- Granularity -->
          <div style="display:flex;align-items:center;gap:6px">
            <span style="font-size:12px;font-weight:600;color:var(--gray-600)">${t('reports.tlGranularity')}</span>
            <div class="segmented-ctrl" id="tlGran">
              <button class="seg-btn active" data-v="month">${t('reports.tlMonth')}</button>
              <button class="seg-btn" data-v="quarter">${t('reports.tlQuarter')}</button>
              <button class="seg-btn" data-v="year">${t('reports.tlYear')}</button>
            </div>
          </div>

          <!-- Range presets -->
          <div style="display:flex;align-items:center;gap:6px">
            <span style="font-size:12px;font-weight:600;color:var(--gray-600)">${t('reports.tlRange')}</span>
            <div class="segmented-ctrl" id="tlRange">
              <button class="seg-btn" data-v="12m">${t('reports.tlRange12m')}</button>
              <button class="seg-btn active" data-v="2y">${t('reports.tlRange2y')}</button>
              <button class="seg-btn" data-v="5y">${t('reports.tlRange5y')}</button>
              <button class="seg-btn" data-v="custom">${t('reports.tlRangeCustom')}</button>
            </div>
          </div>

          <!-- Custom date inputs (hidden unless custom chosen) -->
          <div id="tlCustomDates" style="display:none;align-items:center;gap:6px">
            <input type="date" id="tlFrom" class="filter-select" style="font-size:12px;padding:4px 8px">
            <span style="font-size:12px;color:var(--gray-400)">–</span>
            <input type="date" id="tlTo"   class="filter-select" style="font-size:12px;padding:4px 8px">
          </div>

        </div>
      </div>

      <!-- Chart area — rendered dynamically -->
      <div id="tlCharts"></div>`;

    // ── Inline segmented control CSS (if not already in app CSS) ─────────────
    // (self-contained; no class collision risk — matches pattern used in popup.css .mode-tabs)
    if (!document.getElementById('tl-seg-style')) {
      const s = document.createElement('style');
      s.id = 'tl-seg-style';
      s.textContent = `
        .segmented-ctrl { 
        display:inline-flex; 
        background:var(--gray-100);
        
        border-radius:6px; 
        overflow:hidden; 
        }
        .seg-btn { flex:1; padding:8px 12px; font-size:12px; font-weight:500; background:var(--gray-100);
          border:none; border-right:1px solid var(--border); cursor:pointer; color:var(--gray-500);
          transition:background 100ms, color 100ms; white-space:nowrap; 
          border-radius:6px;}
        .seg-btn:last-child { border-right:none; }
        .seg-btn.active { background:var(--white); color:var(--gray-800); border:1px solid var(--gray-800) }
      `;
      document.head.appendChild(s);
    }

    // ── Wire controls ─────────────────────────────────────────────────────────
    async function reload() {
      const { from, to } = getDateRange();
      const chartEl = document.getElementById('tlCharts');
      if (!chartEl) return;
      chartEl.innerHTML = loadingState();
      try {
        const res  = await API.stats.timeline({ granularity, from, to }, filter);
        const rows = (res.data || {}).rows || [];
        renderTimelineCharts(chartEl, rows, granularity, reload);
      } catch (e) {
        chartEl.innerHTML = `<div class="connection-banner">${e.message}</div>`;
      }
    }

    document.getElementById('tlGran').addEventListener('click', e => {
      const btn = e.target.closest('.seg-btn');
      if (!btn) return;
      document.querySelectorAll('#tlGran .seg-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      granularity = btn.dataset.v;
      reload();
    });

    document.getElementById('tlRange').addEventListener('click', e => {
      const btn = e.target.closest('.seg-btn');
      if (!btn) return;
      document.querySelectorAll('#tlRange .seg-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      rangePreset = btn.dataset.v;
      const custom = document.getElementById('tlCustomDates');
      custom.style.display = rangePreset === 'custom' ? 'flex' : 'none';
      if (rangePreset !== 'custom') reload();
    });

    // Custom date inputs
    const applyCustom = () => {
      customFrom = document.getElementById('tlFrom')?.value || '';
      customTo   = document.getElementById('tlTo')?.value   || '';
      if (customFrom && customTo) reload();
    };
    document.getElementById('tlFrom')?.addEventListener('change', applyCustom);
    document.getElementById('tlTo')?.addEventListener('change',   applyCustom);

    // Initial load
    await reload();
  }

  function renderTimelineCharts(el, rows, granularity, reload) {
    if (!rows.length) {
      el.innerHTML = `<div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" style="width:40px;height:40px;color:var(--gray-300)">
          <path d="M3 3v18h18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M7 16l4-5 4 3 4-6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <h3>${t('reports.tlNoData')}</h3>
        <p>${t('reports.tlNoDataSub')}</p>
      </div>`;
      return;
    }

    const labels = rows.map(r => r.period);

    // Pass null through so the chart renders a visible gap instead of a
    // misleading flat line at 0 for periods where data isn't available yet.
    const series = key => rows.map(r => r[key] ?? null);

    // Detect completely absent score data (PDFs not yet fully processed)
    const hasScores = rows.some(r => r.avg_score !== null);

    el.innerHTML = `
      <!-- Row 1: Score + Accessibility -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
        <div class="card">
          <div class="section-title" style="display:flex;align-items:center;justify-content:space-between">
            <span>${t('reports.tlScoreTitle')}</span>
            <button class="btn btn-sm btn-secondary" id="tlBackfillBtn" style="font-size:11px;padding:3px 10px">${t('reports.tlBackfillBtn')}</button>
          </div>
          <div style="font-size:11px;color:var(--gray-500);margin-bottom:8px">${t('reports.tlScoreDesc')}</div>
          ${hasScores
            ? `<div id="tlScoreChart"></div>`
            : `<div style="padding:28px 0;text-align:center;font-size:12px;color:var(--gray-400)">${t('reports.tlNoScoreData')}</div>`}
        </div>
        <div class="card">
          <div class="section-title"><span>${t('reports.tlAccessTitle')}</span></div>
          <div style="font-size:11px;color:var(--gray-500);margin-bottom:8px">${t('reports.tlAccessDesc')}</div>
          <div id="tlAccessChart"></div>
        </div>
      </div>

      <!-- Row 2: Properties (tagged, linearized) + Risk (encrypted, pii) -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
        <div class="card">
          <div class="section-title"><span>${t('reports.tlPropsTitle')}</span></div>
          <div style="font-size:11px;color:var(--gray-500);margin-bottom:8px">${t('reports.tlPropsDesc')}</div>
          <div id="tlPropsChart"></div>
        </div>
        <div class="card">
          <div class="section-title"><span>${t('reports.tlRiskTitle')}</span></div>
          <div style="font-size:11px;color:var(--gray-500);margin-bottom:8px">${t('reports.tlRiskDesc')}</div>
          <div id="tlRiskChart"></div>
        </div>
      </div>

      <!-- Row 3: Volume -->
      <div class="card" style="margin-bottom:16px">
        <div class="section-title"><span>${t('reports.tlVolumeTitle')}</span></div>
        <div style="font-size:11px;color:var(--gray-500);margin-bottom:8px">${t('reports.tlVolumeDesc')}</div>
        <div id="tlVolumeChart"></div>
      </div>`;

    if (hasScores) {
      Charts.vbar(document.getElementById('tlScoreChart'), {
        labels,
        height: 180,
        type: 'area',
        datasets: [{ label: t('reports.tlScore'), data: series('avg_score'), color: 'var(--accent)' }],
      });
    }

    // Wire recalculate button — always present in the score card header
    const backfillBtn = document.getElementById('tlBackfillBtn');
    if (backfillBtn) {
      backfillBtn.addEventListener('click', async () => {
        backfillBtn.disabled = true;
        backfillBtn.textContent = t('reports.tlBackfillRunning');
        try {
          const res = await API.documents.backfillScores();
          const n = res?.data?.backfilled ?? 0;
          backfillBtn.textContent = t('reports.tlBackfillDone').replace('{n}', n);
          if (n > 0) {
            // Reload the timeline charts so the newly-scored docs appear
            setTimeout(() => reload(), 800);
            // Sync updated HC summaries (with new scores) to Yukon — fire-and-forget
            if (typeof Yukon !== 'undefined') {
              try {
                const hcRes = await API.healthChecks.list({ status: 'completed', limit: 500 });
                const hcs   = hcRes.data?.health_checks || hcRes.data || [];
                if (hcs.length) {
                  hcs.forEach(hc => Yukon.uploadHCDocument(hc).catch(() => {}));
                  Toast.show(t('reports.yukonSyncStarted').replace('{n}', hcs.length), 'info', 4000);
                }
              } catch { /* best-effort — don't surface Yukon errors over backfill success */ }
            }
          }
        } catch (e) {
          backfillBtn.disabled = false;
          backfillBtn.textContent = t('reports.tlBackfillBtn');
          console.error('Backfill failed', e);
        }
      });
    }

    Charts.vbar(document.getElementById('tlAccessChart'), {
      labels,
      height: 180,
      type: 'area',
      datasets: [{ label: t('reports.tlAccessRate'), data: series('avg_access_rate'), color: 'var(--green)' }],
    });

    Charts.vbar(document.getElementById('tlPropsChart'), {
      labels,
      height: 180,
      type: 'area',
      datasets: [
        { label: t('reports.tlTagged'),     data: series('tagged_pct'),     color: 'var(--accent)' },
        { label: t('reports.tlLinearized'), data: series('linearized_pct'), color: 'var(--purple)' },
      ],
    });

    Charts.vbar(document.getElementById('tlRiskChart'), {
      labels,
      height: 180,
      type: 'area',
      datasets: [
        { label: t('reports.tlEncrypted'), data: series('encrypted_pct'), color: 'var(--yellow)' },
        { label: t('reports.tlPii'),       data: series('pii_pct'),       color: 'var(--red)' },
      ],
    });

    Charts.vbar(document.getElementById('tlVolumeChart'), {
      labels,
      height: 140,
      type: 'bar',
      datasets: [{ label: t('reports.tlPdfCount'), data: series('pdf_count'), color: 'var(--accent)' }],
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────
  function int(v)    { return parseInt(v) || 0; }
  function fmtNum(n) { return n >= 1000 ? (n/1000).toFixed(1)+'k' : String(n); }

  function secStatCard(label, value, total, color, sparkData = null, tooltipText = '') {
    const pct   = total && int(value) >= 0 ? ` (${Math.round(int(value)/total*100)}%)` : '';
    const spark = sparkData && sparkData.length > 1
      ? `<div style="margin-top:8px">${Charts.sparkline(sparkData, { color, width: 100, height: 28, tooltip: tooltipText })}</div>`
      : '';
    return `<div class="stat-card">
      <div class="stat-label">${label}</div>
      <div class="stat-value" style="color:${color}">${value}${pct}</div>
      ${spark}
    </div>`;
  }

  function accStatCard(label, value, color, sparkData = null, tooltipText = '') {
    const spark = sparkData && sparkData.length > 1
      ? `<div style="margin-top:8px">${Charts.sparkline(sparkData, { color, width: 100, height: 28, tooltip: tooltipText })}</div>`
      : '';
    return `<div class="stat-card">
      <div class="stat-label">${label}</div>
      <div class="stat-value" style="color:${color}">${value}</div>
      ${spark}
    </div>`;
  }

  function scoreBar(label, val, total, color) {
    const pct = total ? Math.round((val / total) * 100) : 0;
    return `<div>
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
        <span style="color:var(--gray-600)">${label}</span>
        <span style="color:${color};font-weight:500">${val} (${pct}%)</span>
      </div>
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:${color}"></div></div>
    </div>`;
  }

  function boolIcon(isGood, negativeIsGood = false) {
    const good = isGood;
    return good
      ? `<svg viewBox="0 0 14 14" fill="none" style="width:14px;height:14px;color:var(--green)"><path d="M2 7l4 4 6-7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
      : `<svg viewBox="0 0 14 14" fill="none" style="width:14px;height:14px;color:var(--red)"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
  }

  function emptyState(msg) {
    return `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.5"/></svg><h3>${msg}</h3></div>`;
  }

  function _noDataCard(c) {
    c.innerHTML = `
      <div class="card" style="padding:56px 24px;text-align:center;color:var(--gray-400)">
        <svg viewBox="0 0 48 48" fill="none" style="width:48px;height:48px;opacity:.35;display:block;margin:0 auto 14px">
          <circle cx="24" cy="24" r="20" stroke="currentColor" stroke-width="2"/>
          <path d="M24 16v10M24 30v2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
        <div style="font-size:16px;font-weight:600;color:var(--gray-600);margin-bottom:6px">${t('dashboard.noHcYet')}</div>
        <div style="font-size:13px">${t('dashboard.noHcYetSub')}</div>
      </div>`;
  }

  return { render };
})();

// Expose drill-down methods globally for onclick handlers in dynamic HTML
// (window.ReportsView is populated inside the module during renderSecurity / renderAccessibility)
