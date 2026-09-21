const { SESSION_STORAGE_KEY } = require("../../constants/sessionStorageKey");

Page({
  data: {
    accessToken: "",
    userId: "1",
  },
  onAccessTokenInput(event) {
    this.setData({ accessToken: event.detail.value });
  },
  onUserIdInput(event) {
    this.setData({ userId: event.detail.value });
  },
  onSubmit() {
    const accessToken = String(this.data.accessToken || "").trim();
    const userId = String(this.data.userId || "1").trim();
    if (!accessToken) {
      wx.showToast({ title: "Access token required", icon: "none" });
      return;
    }
    wx.setStorageSync(
      SESSION_STORAGE_KEY,
      JSON.stringify({
        accessToken,
        authToken: accessToken,
        tenantId: "100001",
        organizationId: "default",
        userId,
      }),
    );
    wx.reLaunch({ url: "/pages/inbox/index" });
  },
});
