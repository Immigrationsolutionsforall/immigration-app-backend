const axios = require("axios");
function requireEnv(name){ const v=process.env[name]; if(!v) throw new Error(`Missing required environment variable: ${name}`); return v; }
function simplifyRecord(record){
  const f=record.fields||{};
  const join=(v)=>Array.isArray(v)?v.join(", "):(v||"");
  return { id: record.id, cliente:f["Cliente"]||"", telefonos:f["Teléfonos"]||"", tiposDeCaso:join(f["Tipos de caso"]), procesos:join(f["Procesos"]), asignadoA:join(f["Asignado a"]), estados:join(f["Estados"]), flagsPago:join(f["Flags de pago"]), fechaCorte:f["Fecha límite/corte más cercana"]||"", resumenNotas:f["Resumen de notas"]||"", prioridadManual:join(f["Prioridad manual"]) };
}
async function listRecordsFromView(viewName, maxRecords=25){
  const token=requireEnv("AIRTABLE_TOKEN"), baseId=requireEnv("AIRTABLE_BASE_ID"), tableName=process.env.AIRTABLE_TABLE_NAME||"Master Clientes";
  const url=`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`;
  const records=[]; let offset;
  do{
    const response=await axios.get(url,{headers:{Authorization:`Bearer ${token}`}, params:{view:viewName,pageSize:100,offset}});
    records.push(...response.data.records.map(simplifyRecord));
    offset=response.data.offset;
    if(records.length>=maxRecords) break;
  }while(offset);
  return records.slice(0,maxRecords);
}
module.exports={ listRecordsFromView };
