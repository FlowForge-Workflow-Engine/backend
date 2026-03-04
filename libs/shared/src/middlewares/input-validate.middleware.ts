import { HttpException, HttpStatus } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";

/**
 * Custom middleware function to validate input of incoming HTTP requests.
 * It checks for SQL injection patterns within the request URL and body parameters.
 * Depending on the HTTP method (GET, POST, PUT, PATCH), it processes the request accordingly.
 * If an error or SQL injection is detected, the request is rejected.
 *
 * @param request - The incoming HTTP request object provided by express.
 * @param response - The HTTP response object. Unused in this middleware, but necessary for the signature.
 * @param next - The next middleware function in the express stack.
 * @throws {HttpException} Throws an `HttpException` with status `FORBIDDEN` if an error occurs during validation.
 */
export function customInputValidation(request: Request, response: Response, next: NextFunction): void {
  try {
    const requestMethod: string = request.method;
    let error: any = {};

    // Check for SQL injection in the request URL
    validateRequestUrl(request);

    // Validate the request parameters based on the request method
    switch (requestMethod) {
      case "GET":
        error = processGetRequest(request);
        break;
      case "POST":
      case "PUT":
      case "PATCH":
        error = processPostRequest(request);
        break;
      // Additional cases can be added for other HTTP methods as needed
    }

    // If errors are found, reject the request
    if (errorExist(error)) rejectRequest(error);

    // Proceed to the next middleware function if no error
    next();
  } catch (e) {
    throw new HttpException(e.message, HttpStatus.FORBIDDEN);
  }
}

/**
 * Validates the request URL to check whether it contains any SQL injection pattern.
 *
 * @param request - The incoming HTTP request object containing the URL to validate.
 * @returns void - Returns nothing.
 */
function validateRequestUrl(request: Request): void {
  const requestUrl = `${request.protocol}://${request.get("host")}${request.originalUrl}`;
  if (requestUrl !== null && requestUrl !== undefined) {
    const validatedUrlRes = findInjection({ request_url: requestUrl });
    if (errorExist(validatedUrlRes)) rejectRequest(validatedUrlRes);
  }
}

/**
 * Helper function that throws an `HttpException` with a predefined message
 * and FORBIDDEN status code when an error is encountered.
 *
 * @param error - An object containing error details including the key where invalid content was found.
 * @throws {HttpException} Throws an `HttpException` indicating that the request is forbidden.
 */
function rejectRequest(error: any): void {
  const errMessage = `Invalid content passed on ${error["requestKey"]}`;
  throw new HttpException(errMessage, HttpStatus.FORBIDDEN);
}

/**
 * Processes GET requests parameters to check for SQL injection.
 * If any suspicious activity is found, it returns the error else it sanitizes the object.
 *
 * @param request - The incoming HTTP request object with query parameters to process.
 * @returns {any} An object that contains either a sanitized object or an error if an injection is found.
 */
function processGetRequest(request: Request): any {
  let error: any = {};
  const requestQuery = request.query;
  if (requestQuery && Object.keys(requestQuery).length) {
    error = findInjection(requestQuery);
    if (!errorExist(error)) {
      request.query = error["sanitizedObject"];
    }
  }
  return error;
}

/**
 * Determines if the given error object has any valid entries that indicate an error status.
 *
 * @param error - The object potentially containing error information.
 * @returns {boolean} True if an error exists; otherwise false.
 */
function errorExist(error: any): boolean {
  return error && Object.keys(error).length && error["errorStatus"];
}

/**
 * Processes POST request parameters by checking for SQL injection and XSS patterns.
 * This function sanitizes the body of the incoming POST request.
 * If any suspicious patterns are detected, it returns an error object with details.
 *
 * @param request - The express request object containing the body to be processed.
 * @returns An object that contains a sanitized object or an error if an injection is found.
 */
function processPostRequest(request: Request): any {
  let error: any = {};
  const bodyParams = request.body;

  // Handle non-array bodyParams
  if (bodyParams && Object.keys(bodyParams).length && !Array.isArray(bodyParams)) {
    error = findInjection(bodyParams);
    request.body = error["sanitizedObject"];
  }

  // Handle array bodyParams
  if (bodyParams && Array.isArray(bodyParams) && bodyParams.length) {
    for (let i = 0; i < bodyParams.length; i++) {
      error = findInjection(bodyParams[i]);
      bodyParams[i] = error["sanitizedObject"];
      if (error && Object.keys(error).length && error["errorStatus"] === true) break;
    }
  }

  return error;
}

/**
 * Scans request parameters for potential injection points such as SQL injections or XSS.
 * Sanitizes the provided input by stripping HTML/script tags and applying security rules.
 *
 * @param input_params - Input parameters from the request to validate and sanitize.
 * @returns An object with information about possible injections and the sanitized result.
 */
function findInjection(input_params: any): any {
  let error: any = { errorStatus: false };

  for (const key in input_params) {
    if (input_params.hasOwnProperty(key)) {
      const originalValue = input_params[key];
      if (originalValue || typeof originalValue === "boolean") {
        let sanitizedValue =
          typeof originalValue === "string" ? originalValue.replace(/%20/g, " ") : originalValue;

        if (typeof originalValue === "string") {
          sanitizedValue = sanitizeUrl(sanitizedValue); // Sanitize URL
          sanitizedValue = stripeHtmlScriptTags(sanitizedValue); // Remove HTML/Script tags

          const isInjectionFound = applyInjectionRule(sanitizedValue); // Check for injections
          if (isInjectionFound) {
            error = {
              requestKey: key,
              errorStatus: true,
              sanitizedObject: null,
            };
            break;
          } else {
            input_params[key] = sanitizedValue;
          }
        }
      }
    }
  }

  if (!error.errorStatus) {
    error["sanitizedObject"] = input_params;
  }

  return error;
}

/**
 * Strips HTML and script tags from a string to mitigate against XSS attacks.
 *
 * @param input - The string to be sanitized.
 * @returns The sanitized string without HTML and script tags.
 */
function stripeHtmlScriptTags(input: string): string {
  const htmlRegex = /<([^>]+?)([^>]*?)>(.*?)<\/\1>/gi;
  return input.replace(htmlRegex, "");
}

/**
 * Applies various regular expression rules to detect SQL injections and XSS instances.
 *
 * @param input - The value to be checked against injection rules.
 * @returns `true` if any rule is violated indicating potential injection, otherwise `false`.
 */
function applyInjectionRule(input: string): boolean {
  // Regular expressions for different types of injections
  const sql = new RegExp("w*((%27)|('))((%6F)|o|(%4F))((%72)|r|(%52))", "i");
  const sqlMeta = new RegExp("(%27)|(')|(--)|(%23)|(#)", "i");
  const sqlMetaVersion2 = new RegExp("((%3D)|(=))[^\n]*((%27)|(')|(--)|(%3B)|(;))", "i");
  const sqlUnion = new RegExp("((%27)|('))union", "i");

  const xssSimple = new RegExp("((%3C)|<)((%2F)|/)*[a-z0-9%]+((%3E)|>)", "i");
  const xssImgSrc = new RegExp("((%3C)|<)((%69)|i|(%49))((%6D)|m|(%4D))((%67)|g|(%47))[^\n]+((%3E)|>)", "i");

  // Check the input against each regular expression
  return (
    sql.test(input) ||
    sqlMeta.test(input) ||
    sqlMetaVersion2.test(input) ||
    sqlUnion.test(input) ||
    xssSimple.test(input) ||
    xssImgSrc.test(input)
  );
}

/**
 * Checks whether a given URL starts with '/' or '.', identifying it as a relative URL without a protocol.
 *
 * @param url - The URL to check.
 * @returns `true` if the URL is a relative path, `false` otherwise.
 */
function isRelativeUrlWithoutProtocol(url: string): boolean {
  return url.startsWith(".") || url.startsWith("/");
}

/**
 * Sanitizes a URL by removing certain control characters and ensuring the protocol is valid.
 * If the URL is found to have an invalid protocol, it will be replaced with 'about:blank'.
 *
 * @param url - The URL to be sanitized.
 * @returns The sanitized URL, or 'about:blank' if the original URL had an invalid protocol.
 */
function sanitizeUrl(url?: string): string {
  if (!url) {
    return "about:blank";
  }

  // Remove control characters and trim the URL
  const ctrlCharactersRegex = /[\u0000-\u001F\u007F-\u009F\u2000-\u200D\uFEFF]/gim;
  let sanitizedUrl = url.replace(ctrlCharactersRegex, "").trim();

  // If the URL is relative, no further processing is necessary
  if (isRelativeUrlWithoutProtocol(sanitizedUrl)) {
    return sanitizedUrl;
  }

  // Check for invalid protocols
  const urlSchemeRegex = /^([^:]+):/gm;
  const invalidProtocolRegex = /^([^\w]*)(javascript|data|vbscript)/im;
  const urlSchemeParseResults = sanitizedUrl.match(urlSchemeRegex);

  if (urlSchemeParseResults) {
    const urlScheme = urlSchemeParseResults[0];
    if (invalidProtocolRegex.test(urlScheme)) {
      return "about:blank";
    }
  }

  return sanitizedUrl;
}
