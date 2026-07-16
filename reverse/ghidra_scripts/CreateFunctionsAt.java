// Disassembles and creates functions at explicitly discovered entry points.
// @category Angel2

import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;

public class CreateFunctionsAt extends GhidraScript {
    @Override
    protected void run() throws Exception {
        String[] args = getScriptArgs();
        if (args.length == 0) {
            throw new IllegalArgumentException("Expected one or more entry addresses");
        }
        for (String text : args) {
            Address address = currentProgram.getAddressFactory().getAddress(text);
            if (getInstructionAt(address) == null && !disassemble(address)) {
                throw new IllegalStateException("Could not disassemble " + address);
            }
            Function function = getFunctionAt(address);
            if (function == null) {
                function = createFunction(address, null);
            }
            if (function == null) {
                throw new IllegalStateException("Could not create function at " + address);
            }
            println("FUNCTION address=" + address + " name=" + function.getName());
        }
    }
}
