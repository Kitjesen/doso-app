await (async () => {
  const nodes = {
    'auth-email-otp-light.png': '3444:2752',
    'auth-email-otp-dark.png': '3444:2774',
    'auth-email-otp-landscape.png': '3444:2796',
    'auth-forgot-password-light.png': '3444:2818',
    'auth-forgot-password-dark.png': '3444:2836',
    'auth-forgot-password-landscape.png': '3444:2854',
    'auth-reset-password-light.png': '3444:2872',
    'auth-reset-password-dark.png': '3444:2894',
    'auth-reset-password-landscape.png': '3444:2916',
    'auth-username-light.png': '3444:2938',
    'auth-username-dark.png': '3444:2956',
    'auth-username-landscape.png': '3444:2974',
    'auth-display-name-light.png': '3444:2992',
    'auth-display-name-dark.png': '3444:3012',
    'auth-display-name-landscape.png': '3444:3032',
    'auth-mfa-light.png': '3444:3052',
    'auth-mfa-dark.png': '3444:3068',
    'auth-mfa-landscape.png': '3444:3084',
    'device-bind-light.png': '3444:3100',
    'device-bind-dark.png': '3444:3122',
    'device-bind-landscape.png': '3444:3144',
    'device-ble-discovery-light.png': '3444:3166',
    'device-ble-discovery-dark.png': '3444:3182',
    'device-ble-discovery-landscape.png': '3444:3198',
    'device-provisioning-light.png': '3444:3214',
    'device-provisioning-dark.png': '3444:3230',
    'device-provisioning-landscape.png': '3444:3246',
    'device-firmware-light.png': '3444:3262',
    'device-firmware-dark.png': '3444:3278',
    'device-firmware-landscape.png': '3444:3294',
    'account-security-light.png': '3444:3310',
    'account-security-dark.png': '3444:3326',
    'account-security-landscape.png': '3444:3342',
  };
  const exported = [];
  for (const [filename, nodeId] of Object.entries(nodes)) {
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node || !('exportAsync' in node)) throw new Error(`Missing exportable Figma node ${nodeId}`);
    const bytes = await node.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: 1 } });
    const response = await fetch(`http://127.0.0.1:4182/export/${filename}`, { method: 'POST', body: bytes });
    if (!response.ok) throw new Error(`${filename} export failed: ${response.status} ${await response.text()}`);
    exported.push({ filename, nodeId, bytes: bytes.length });
  }
  console.log(`DOSO_SOURCE_SYNC_11_FIGMA_EXPORT_PASS ${JSON.stringify(exported)}`);
})();
