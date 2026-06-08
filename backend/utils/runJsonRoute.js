/** Run an Express `(req, res)` handler and resolve with the JSON body. */
export function runJsonRoute(handler, req) {
  return new Promise((resolve, reject) => {
    let statusCode = 200;
    const res = {
      set() {
        return res;
      },
      setHeader() {
        return res;
      },
      status(code) {
        statusCode = code;
        return res;
      },
      json(data) {
        if (statusCode >= 400) {
          reject(new Error(data?.message || `Request failed (${statusCode})`));
        } else {
          resolve(data);
        }
        return res;
      },
      send(data) {
        if (statusCode >= 400) {
          reject(new Error(typeof data === 'string' ? data : 'Request failed'));
        } else {
          resolve(data);
        }
        return res;
      },
    };

    try {
      const result = handler(req, res, (err) => {
        if (err) reject(err);
      });
      Promise.resolve(result).catch(reject);
    } catch (err) {
      reject(err);
    }
  });
}

export function forkDashboardReq(req, queryPatch = {}) {
  return {
    user: req.user,
    companyModels: req.companyModels,
    query: { ...req.query, ...queryPatch },
  };
}
