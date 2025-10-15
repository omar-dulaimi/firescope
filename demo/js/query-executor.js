import { showStatus } from './ui-utils.js';

// Query execution utility
async function executeQuery(name, queryFunction) {
  try {
    console.log(`🔍 Executing: ${name}`);
    showStatus(`Executing: ${name}`, 'info');

    const startTime = Date.now();
    const result = await queryFunction();
    const duration = Date.now() - startTime;

    const count =
      (typeof result?.size === 'number' ? result.size : null) ??
      (Array.isArray(result?.docs) ? result.docs.length : null) ??
      (typeof result?.data === 'function' &&
      typeof result.data()?.count === 'number'
        ? result.data().count
        : 0);
    let details = '';
    if (typeof result?.data === 'function') {
      try {
        const agg = result.data();
        details = ` | Aggregate: ${JSON.stringify(agg)}`;
        console.log('📊 Aggregate data:', agg);
      } catch (e) {
        // ignore
      }
    }
    console.log(
      `✅ ${name} completed in ${duration}ms - Found ${count} documents`
    );
    showStatus(
      `${name} completed - Found ${count} documents (${duration}ms)${details}`,
      'success'
    );

    return result;
  } catch (error) {
    console.error(`❌ ${name} failed:`, error);
    showStatus(`${name} failed: ${error.message}`, 'error');
    throw error;
  }
}

export { executeQuery };
