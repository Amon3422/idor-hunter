import SwaggerParser from "@apidevtools/swagger-parser";

async function extractApiData(filePath) {
  try {
    // dereference() resolves all $ref pointers so you get actual parameter objects
    let api = await SwaggerParser.dereference('crapi-openapi-spec.json');

    console.log(`API Title: ${api.info.title}`);

    // Iterate through all paths (endpoints)
    const endpoints = Object.keys(api.paths).map((path) => {
      const methods = api.paths[path];
      
      return Object.keys(methods).map((method) => {
        const operation = methods[method];

        // Extract parameters (merging path-level and operation-level params)
        const parameters = (operation.parameters || []).concat(methods.parameters || []);

        return {
          endpoint: path,
          method: method.toUpperCase(),
          summary: operation.summary,
          parameters: parameters.map(p => ({
            name: p.name,
            location: p.in, // e.g., 'query', 'path', 'header'
            required: p.required || false,
            type: p.schema ? p.schema.type : 'unknown'
          }))
        };
      });
    }).flat();

    console.log(JSON.stringify(endpoints, null, 2));
  } catch (err) {
    console.error("Parsing error:", err);
  }
}

extractApiData("openapi.json");