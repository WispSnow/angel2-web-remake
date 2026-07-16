// Print direct references and containing caller functions for one or more addresses.
// Usage: -postScript PrintFunctionCallers.java 1000:22c9 0000:9123

import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;
import ghidra.program.model.symbol.Reference;
import ghidra.program.model.symbol.ReferenceIterator;

public class PrintFunctionCallers extends GhidraScript {
    @Override
    protected void run() throws Exception {
        String[] arguments = getScriptArgs();
        if (arguments.length == 0) {
            throw new IllegalArgumentException("pass at least one target address");
        }
        for (String addressText : arguments) {
            Address target = currentProgram.getAddressFactory().getAddress(addressText);
            if (target == null) {
                println("=== " + addressText + " (invalid address) ===");
                continue;
            }
            println("=== references to " + target + " ===");
            ReferenceIterator references = currentProgram.getReferenceManager()
                .getReferencesTo(target);
            int count = 0;
            while (references.hasNext()) {
                Reference reference = references.next();
                Address from = reference.getFromAddress();
                Function caller = getFunctionContaining(from);
                println(from + "  " + reference.getReferenceType() + "  " +
                    (caller == null ? "<no function>" :
                        caller.getName() + " @ " + caller.getEntryPoint()));
                count += 1;
            }
            println("referenceCount=" + count);
        }
    }
}
