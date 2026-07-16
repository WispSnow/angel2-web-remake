// Removes explicitly identified accidental function entries without clearing disassembly.
// @category Angel2

import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;

public class RemoveFunctionsAt extends GhidraScript {
    @Override
    protected void run() throws Exception {
        String[] args = getScriptArgs();
        if (args.length == 0) {
            throw new IllegalArgumentException("Expected one or more function-entry addresses");
        }
        for (String text : args) {
            Address address = currentProgram.getAddressFactory().getAddress(text);
            Function function = getFunctionAt(address);
            if (function == null) {
                println("NO_FUNCTION address=" + address);
                continue;
            }
            String name = function.getName();
            if (!currentProgram.getFunctionManager().removeFunction(address)) {
                throw new IllegalStateException("Could not remove function at " + address);
            }
            println("REMOVED address=" + address + " name=" + name);
        }
    }
}
