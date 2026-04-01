/**
 * Universal Dynamic Request Function (Enhanced)
 * - Supports: JSON, FormData, x-www-form-urlencoded, and images (Base64)
 * - Error-handling and debug improved
 */
import * as cheerio from 'cheerio';
import { log } from './config/logConfig.js';
import { Transaction } from './models/transaction.js';
import { updateTransactionInExcel } from './config/uploadConfig.js';




const request = async (url, payload = null, timeout = 10000, options = {}) => {
    const { method, headers: optHeaders, contentType } = options;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    let headers = { ...optHeaders };
    let body = null;

    try {
        if (payload) {
            if (payload instanceof FormData) {
                body = payload;
                // Don't set Content-Type
            } else if (contentType === 'form') {
                headers['Content-Type'] = 'application/x-www-form-urlencoded;charset=UTF-8';
                body = typeof payload === 'string' ? payload : new URLSearchParams(payload).toString();
            } else {
                headers['Content-Type'] = 'application/json';
                body = JSON.stringify(payload);
            }
        }

        const fetchOptions = {
            method: method || (payload ? 'POST' : 'GET'),
            headers,
            body,
            redirect: 'manual',
            signal: controller.signal,
        };

        const response = await fetch(url, fetchOptions);
        clearTimeout(timer);

        const text = await response.text();

        // Manual 302 Redirect
        if (response.status === 302) {
            return {
                status: 302,
                location: response.headers.get('location'),
                data: text,
                headers: response.headers,
            };
        }
        if (!response.ok) {
            throw new Error(`Request failed (${response.status})`);
        }
        return { status: response.status, data: text, headers: response.headers };
    } catch (error) {
        clearTimeout(timer);
        console.error('❌ [request error]', url, error.message);
        throw error;
    }
};

/**
 * Payment Workflow (stepwise, robust, debuggable)
 * Returns at each important step, never just at the end!
 */
export const payment = async (consumerNo, cookies = '') => {
    // Import cheerio and custom cleanText/max debug helpers as needed

    // Util for logging
    const log = (...args) => console.log('[payment]', ...args);

    // Helper: extract required keys from HTML
    function extractFormData(html, keys) {
        const $ = cheerio.load(html);
        const extracted = {};
        keys.forEach(key => {
            const val =
                $(`input[id='${key}']`).val() ||
                $(`input[name='${key}']`).val() ||
                $(`span[id='${key}']`).text() ||
                $(`[id='${key}']`).text() || '';
            extracted[key] = String(val).trim();
        });
        return extracted;
    }

    try {
        // 1️⃣ Fetch captcha
        const capRes = await request('https://www.mahadiscom.in/captcha.php', null, 5000, {
            method: 'GET',
            headers: {
                'Accept': '*/*',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'Referer': 'https://www.mahadiscom.in/en/home/',
            }
        });
        log('Captcha image (Base64):', capRes.data);
        // Optionally return here if only captcha fetch needed
        // return { step: 'captcha', captchaBase64: capRes.data };

        // 2️⃣ Get bill details (POST)
        const billPayload = new URLSearchParams({
            consumerNo,
            uiActionName: 'getPaymentDetail_Link',
            redi_: 'true',
            terms: 'on',
        }).toString();
        const billRes = await request(
            'https://www.mahadiscom.in/quickpay.php',
            billPayload,
            8000,
            {
                method: 'POST',
                contentType: 'form',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'text/html,application/xhtml+xml',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                    'Cookie': cookies,
                }
            }
        );
        log('Bill fetched:', billRes.status);
        log('biii', billRes)

        // After bill fetch, handle redirect
        if (billRes.status === 302 && billRes.location) {
            log('[payment] Redirect detected, fetching redirected URL');
            // Ensure HTTPS
            const redirectUrl = billRes.location.replace('http://', 'https://');
            const redirectedPage = await request(redirectUrl, null, 8000, {
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                    'Cookie': cookies,
                    'Referer': 'https://www.mahadiscom.in/quickpay.php',
                    'Accept': 'text/html,application/xhtml+xml',
                }
            });
            if (!redirectedPage.data) throw new Error('Redirected bill HTML empty.');
            billRes.data = redirectedPage.data;
        } else if (billRes.status !== 200) {
            throw new Error(`Unexpected bill fetch status: ${billRes.status}`);
        }

        // 3️⃣ Extract tokens and bill info from HTML (change keys as required)
        const keysToExtract = [
            '__VIEWSTATE', '__VIEWSTATEGENERATOR', '__EVENTVALIDATION',
            'hdnConsumerNo', 'hdnBu', 'hdnConsumerNumber', 'txtCustomerID',
            'txtAdditionalInfo1', 'txtAdditionalInfo2', 'txtAdditionalInfo3',
            'billTypeCode', 'finalamt', 'promptPayDisAmt', 'dueDt', 'hdnBillAmounts',
            'makePaymentURL', 'billdate', 'txtAmtToPay', 'agree_terms',
            'IS_MULTIPLE_ADVANCE_PAYMENT', 'hdnConsumption', 'hdnpromptPaymentDiscountDate',
            'consumer_no', 'amount', "AmountToPayRow", 'bill_mth', 'circle', 'partial_payment',
            'phone', 'minamt', 'maxamt', 'orisdamt', 'oripayamt',
            'hdnCreditLimit', 'hdnServiceTax', 'hdnMobileNo', 'billDueDate',
            'promptPaymentDiscountDate', 'promptPaymentDiscountAmount', 'txtsdAmount'
        ]; // your list here
        const tokens = extractFormData(billRes.data, keysToExtract);
        log('Extracted form state:', tokens);


        // 4️⃣ Prepare payment payload and send to WSS
        const paymentPayload = {
            ...tokens,
            // set or overwrite with up-to-date payment values
            __EVENTTARGET: "",
            __EVENTARGUMENT: "",
            submit: "Process Payment",
            // etc
        };
        const paymentRes = await request(
            "https://wss.mahadiscom.in/wss/wss_makepayment_new.aspx",
            new URLSearchParams(paymentPayload),
            10000,
            {
                method: "POST",
                contentType: "form",
                headers: {
                    // Required/updated headers
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
                    "Cookie": cookies,
                    "Referer": "https://wss.mahadiscom.in/",
                }
            }
        );
        log('Payment init response:', paymentRes.status);

        // 5️⃣ If redirected to gateway, process that
        if (paymentRes.status === 302 && paymentRes.location) {
            log('Redirected for payment gateway:', paymentRes.location);
            return {
                success: true,
                message: "Payment initiated successfully, continue in gateway.",
                step: 'gateway',
                redirect: paymentRes.location
            };
        }

        // 6️⃣ Handle HTML response from payment, extract next tokens & process payment gateway if needed
        const html = paymentRes.data;
        const $ = cheerio.load(html);
        const msg = $(`input[id='msg']`).val();
        const systemid = $(`input[id='systemid']`).val();
        const paymentGatewayPayload = new URLSearchParams({
            msg,
            systemid,
            Submit: "Process Payment"
        }).toString();

        // Gateway request (optional: repeat for each required gateway hop)
        const gatewayHeaders = {
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            "Cookie": cookies,
            "Referer": "https://billing.mahadiscom.in/processpayment.php"
        };
        const gatewayRes = await request(
            "https://billing.mahadiscom.in/processpayment.php",
            paymentGatewayPayload,
            10000,
            { method: "POST", contentType: "form", headers: gatewayHeaders }
        );
        // console.log(gatewayRes)
        if (gatewayRes.status === 302 && gatewayRes.location) {
            log('Final payment redirected:', gatewayRes.location);
            return {
                success: true,
                message: "Payment gateway redirect success.",
                step: 'final-redirect',
                redirect: gatewayRes.headers.location,
            };
        }

        // Process user HTML or extract error/result indication
        return {
            success: true,
            message: "Payment request sequence completed.",
            pageTitle: $('title').text(),
            resultHTML: gatewayRes.data,
            step: 'finished'
        };

    } catch (error) {
        log('❌ Error:', error.message);
        return { success: false, message: error.message, step: 'error' };
    }
};




// Check Payment Status 

export const chetPaymentStatus = async (tx, consumerNo, amount, cookies = '') => {
    // Import cheerio and custom cleanText/max debug helpers as needed
    console.log(consumerNo, amount)
    // Util for logging
    // const log = (...args) => console.log('[payment]', ...args);

    // Helper: extract required keys from HTML
    function extractFormData(html, keys) {
        const $ = cheerio.load(html);
        const extracted = {};
        keys.forEach(key => {
            const val =
                $(`input[id='${key}']`).val() ||
                $(`input[name='${key}']`).val() ||
                $(`span[id='${key}']`).text() ||
                $(`[id='${key}']`).text() || '';
            extracted[key] = String(val).trim();
        });
        return extracted;
    }

    try {
        // 1️⃣ Fetch captcha
        const capRes = await request('https://www.mahadiscom.in/captcha.php', null, 5000, {
            method: 'GET',
            headers: {
                'Accept': '*/*',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'Referer': 'https://www.mahadiscom.in/en/home/',
            }
        });
        log('Captcha image (Base64):', capRes.data);
        // Optionally return here if only captcha fetch needed
        // return { step: 'captcha', captchaBase64: capRes.data };

        // 2️⃣ Get bill details (POST)
        const billPayload = new URLSearchParams({
            consumerNo,
            uiActionName: 'getPaymentDetail_Link',
            redi_: 'true',
            terms: 'on',
        }).toString();
        const billRes = await request(
            'https://www.mahadiscom.in/quickpay.php',
            billPayload,
            8000,
            {
                method: 'POST',
                contentType: 'form',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'text/html,application/xhtml+xml',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                    'Cookie': cookies,
                }
            }
        );
        log('Bill fetched:', "Data Fetched Successfully" + billRes.status);
        // log('biii', billRes)

        // After bill fetch, handle redirect
        if (billRes.status === 302 && billRes.location) {
            log('[payment] Redirect detected, fetching redirected URL');
            // Ensure HTTPS
            const redirectUrl = billRes.location.replace('http://', 'https://');
            const redirectedPage = await request(redirectUrl, null, 8000, {
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                    'Cookie': cookies,
                    'Referer': 'https://www.mahadiscom.in/quickpay.php',
                    'Accept': 'text/html,application/xhtml+xml',
                }
            });
            if (!redirectedPage.data) throw new Error('Redirected bill HTML empty.');
            billRes.data = redirectedPage.data;
        } else if (billRes.status !== 200) {
            throw new Error(`Unexpected bill fetch status: ${billRes.status}`);
        }

        // 3️⃣ Extract tokens and bill info from HTML (change keys as required)
        const keysToExtract = [
            '__VIEWSTATE', '__VIEWSTATEGENERATOR', '__EVENTVALIDATION',
            'hdnConsumerNo', 'hdnBu', 'hdnConsumerNumber', 'txtCustomerID',
            'txtAdditionalInfo1', 'txtAdditionalInfo2', 'txtAdditionalInfo3',
            'billTypeCode', 'finalamt', 'promptPayDisAmt', 'dueDt', 'hdnBillAmounts',
            'makePaymentURL', 'billdate', 'txtAmtToPay', 'agree_terms',
            'IS_MULTIPLE_ADVANCE_PAYMENT', 'hdnConsumption', 'hdnpromptPaymentDiscountDate',
            'consumer_no', 'amount', "AmountToPayRow", 'bill_mth', 'circle', 'partial_payment',
            'phone', 'minamt', 'maxamt', 'orisdamt', 'oripayamt',
            'hdnCreditLimit', 'hdnServiceTax', 'hdnMobileNo', 'billDueDate',
            'promptPaymentDiscountDate', 'promptPaymentDiscountAmount', 'txtsdAmount'
        ]; // your list here
        const tokens = extractFormData(billRes.data, keysToExtract);
        // log('Extracted form state:', tokens);
        const result = await updateTransactionInExcel(tx.TransactionID, tokens, amount);
        console.log(result);
        return {
            ...result,
            consumerNo
        };


    } catch (err) {
        console.log(err)
        return { success: false }
    }
 

}



const paymentRes = async () => {
    const data = await payment('065510698210', 'sessioncookiestring');
    console.log(data, "res data")
    return data
}

// const res = await paymentRes()
// console.log(res);
