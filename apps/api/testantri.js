const fetch = global.fetch;

const API_URL = 'https://mst.it-cpi002-rt.cfapps.ap10.hana.ondemand.com/http/timesheet_QA';
const USERNAME = 'sb-536163d0-4359-40c4-8d17-07ec0fd8d3e1!b672|it-rt-mst!b80';
const PASSWORD =
  '74a46ba6-2c31-4116-814f-4c6af186581f$og9p7Ha3hijivoXXMChQBTEyBAxnfJWZQsvVjjFVx6k=';

const basicAuth = 'Basic ' + Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64');

const payloads = [
  {
    ZTIMESHEETID: '566',
    PERNR: '00016502',
    RUECK: '0004727824',
    AUFNR: '001000073558',
    VORNR: '0020',
    FLGAT: '1',
    PLNFL: '000001',
    VORNR_B: '0020',
    VORNR_R: '0030',
    ZCONF_TYPE: '',
    ARBPL: 'M5051WLS',
    LSTAR: '',
    ISDD: '20260118',
    ISDZ: '153800',
    IEDD: '20260118',
    IEDZ: '205900',
    WERKS: '5051',
    AUERU: '',
    ZBARCODEID: '1575343',
  },
  {
    ZTIMESHEETID: '9400000002',
    AUFNR: '',
    VORNR: '',
    FLGAT: '',
    PLNFL: '',
    VORNR_B: '',
    VORNR_R: '',
    PERNR: '16502',
    RUECK: '',
    ZCONF_TYPE: '',
    ARBPL: 'M5100ASM',
    LSTAR: '1640',
    ISDD: '20260308',
    ISDZ: '153800',
    IEDD: '20260308',
    IEDZ: '235900',
    WERKS: '5100',
    AUERU: '',
    ZBARCODEID: '1480803',
  },
];

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendData() {
  for (let i = 0; i < payloads.length; i++) {
    const data = payloads[i];

    console.log(`\n Sending data ${i + 1} of ${payloads.length}...`);

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          Authorization: basicAuth,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      const text = await response.text();

      console.log('STATUS:', response.status);
      console.log('RESPONSE:', text);
    } catch (err) {
      console.error(' Error:', err.message);
    }

    if (i < payloads.length - 1) {
      console.log('Waiting ...');
      await delay(100);
    }
  }

  console.log('\n All data sent!');
}

sendData();
